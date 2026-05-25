import { eq, and } from "drizzle-orm";
import {
  getLocalScheduleDecision,
  matchReminderHits,
  type Subscription,
  type Settings,
  type NotificationHit,
} from "@qreminder/shared";
import {
  notificationJobs,
  settings as settingsTable,
  subscriptions as subscriptionsTable,
  notificationTemplates,
  users,
} from "../db/schema.js";
import type { Database } from "../db/types.js";
import type { MailerAdapter } from "../adapters/mailer.js";
import { dispatchToChannels, type ChannelMessage, type ChannelSendResult } from "./channel-dispatcher.js";
import {
  resolveChannelsForSubscription,
  renderTemplate,
  buildTemplateVariables,
} from "./channel-resolver.js";

export interface NotificationCronOptions {
  now?: Date;
  windowMinutes?: number;
  maxRetries?: number;
  staleSendingMinutes?: number;
  force?: boolean;
  dryRun?: boolean;
}

export interface NotificationCronUserResult {
  userId: string;
  action: "sent" | "skipped" | "failed";
  reason?: string;
  hits?: NotificationHit[];
}

export interface NotificationCronResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  results: NotificationCronUserResult[];
}

interface CronDeps {
  db: Database;
  mailer: MailerAdapter;
}

const defaultSettings: Settings = {
  user: "",
  timezone: "Asia/Shanghai",
  notificationTimeLocal: "09:00",
  enabledChannels: [],
  locale: "zh-CN",
  signupEnabled: false,
  signupAllowlist: [],
  channels: {},
};

function resolveOptions(options: NotificationCronOptions): Required<NotificationCronOptions> {
  return {
    now: options.now ?? new Date(),
    windowMinutes: options.windowMinutes ?? 2,
    maxRetries: options.maxRetries ?? 3,
    staleSendingMinutes: options.staleSendingMinutes ?? 15,
    force: options.force ?? false,
    dryRun: options.dryRun ?? false,
  };
}

function mergeSettings(stored: Record<string, unknown> | undefined): Settings {
  return { ...defaultSettings, ...(stored ?? {}) } as Settings;
}

function rowToSubscription(row: typeof subscriptionsTable.$inferSelect): Subscription {
  return {
    id: row.id,
    user: row.user,
    name: row.name,
    logo: row.logo ?? "",
    price: row.price,
    currency: row.currency,
    billingCycle: row.billingCycle,
    customDays: row.customDays ?? null,
    category: row.category,
    status: row.status,
    paymentMethod: row.paymentMethod ?? "",
    startDate: row.startDate,
    nextBillingDate: row.nextBillingDate,
    autoCalculateNextBillingDate: row.autoCalculateNextBillingDate,
    trialEndDate: row.trialEndDate ?? null,
    website: row.website ?? null,
    notes: row.notes ?? "",
    tags: row.tags,
    extra: row.extra,
    reminderOffsets: row.reminderOffsets,
    snoozedUntil: row.snoozedUntil ?? null,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

export async function runNotificationCron(
  deps: CronDeps,
  options: NotificationCronOptions = {},
): Promise<NotificationCronResult> {
  const opts = resolveOptions(options);
  const allUsers = await deps.db.select().from(users);
  const allSettingsRows = await deps.db.select().from(settingsTable);
  const allSubscriptions = await deps.db.select().from(subscriptionsTable);

  const settingsByUser = new Map<string, Settings>();
  for (const row of allSettingsRows) {
    settingsByUser.set(row.user, mergeSettings((row.settings as Record<string, unknown>) ?? {}));
  }
  const subsByUser = new Map<string, Subscription[]>();
  for (const row of allSubscriptions) {
    const existing = subsByUser.get(row.user) ?? [];
    existing.push(rowToSubscription(row));
    subsByUser.set(row.user, existing);
  }

  const results: NotificationCronUserResult[] = [];
  for (const userRow of allUsers) {
    if (userRow.banned) {
      results.push({ userId: userRow.id, action: "skipped", reason: "user_banned" });
      continue;
    }
    const settings = settingsByUser.get(userRow.id) ?? defaultSettings;
    const decision = getLocalScheduleDecision(
      opts.now,
      settings.timezone,
      settings.notificationTimeLocal,
      opts.windowMinutes,
      opts.force,
    );
    if (!decision.due) {
      results.push({ userId: userRow.id, action: "skipped", reason: decision.reason });
      continue;
    }
    if (settings.enabledChannels.length === 0) {
      results.push({ userId: userRow.id, action: "skipped", reason: "no_enabled_channels" });
      continue;
    }

    const userSubs = subsByUser.get(userRow.id) ?? [];
    const hits = matchReminderHits({
      subscriptions: userSubs,
      todayLocal: decision.scheduledLocalDate,
    });
    if (hits.length === 0 && !opts.force) {
      results.push({ userId: userRow.id, action: "skipped", reason: "no_due_items" });
      continue;
    }

    if (opts.dryRun) {
      results.push({ userId: userRow.id, action: "sent", reason: "dry_run", hits });
      continue;
    }

    const existingJob = await findJob(deps.db, userRow.id, decision);
    if (existingJob && (existingJob.status === "sent" || existingJob.status === "skipped")) {
      results.push({
        userId: userRow.id,
        action: "skipped",
        reason: existingJob.status === "sent" ? "already_sent" : "already_skipped",
      });
      continue;
    }
    if (
      existingJob &&
      existingJob.status === "failed" &&
      !opts.force &&
      existingJob.attempts >= opts.maxRetries
    ) {
      results.push({ userId: userRow.id, action: "skipped", reason: "max_retries_reached" });
      continue;
    }

    const attempts = (existingJob?.attempts ?? 0) + 1;
    const jobPayload = {
      scheduledLocalDate: decision.scheduledLocalDate,
      scheduledLocalTime: decision.scheduledLocalTime,
      timeZone: decision.timeZone,
      scheduledInstantUtc: decision.scheduledInstantUtc,
      attempts,
      result: { hits },
      updatedAt: opts.now.toISOString(),
    };

    // Resolve channels per hit and group hits by their resolved channel set.
    // This is what turns subscriptionNotificationChannels / tag defaults /
    // category defaults from "stored but ignored" into real routing.
    const subById = new Map(userSubs.map((s) => [s.id, s]));
    const channelSettings = settings as unknown as Record<string, unknown>;
    type GroupedHit = { hit: NotificationHit; sub: Subscription | undefined };
    const groups = new Map<string, { channels: string[]; hits: GroupedHit[] }>();

    for (const hit of hits) {
      const sub = subById.get(hit.subscriptionId);
      const resolution = await resolveChannelsForSubscription(
        deps.db,
        userRow.id,
        hit.subscriptionId,
        sub?.category ?? "",
        sub?.tags ?? [],
        settings.enabledChannels,
        channelSettings,
      );
      if (resolution.channels.length === 0) continue;
      const key = [...resolution.channels].sort().join("|");
      const entry = groups.get(key) ?? { channels: resolution.channels, hits: [] };
      entry.hits.push({ hit, sub });
      groups.set(key, entry);
    }

    if (groups.size === 0) {
      // Every hit resolved to zero channels (defensive — shouldn't happen because
      // we already skipped when enabledChannels is empty).
      results.push({ userId: userRow.id, action: "skipped", reason: "no_resolved_channels" });
      continue;
    }

    // Load templates once per user — we pick the best match per hit below.
    const userTemplates = await deps.db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.user, userRow.id));

    const allDispatchResults: ChannelSendResult[] = [];
    let anySuccessAcross = false;

    // Read fallback channels from user settings (deduped against primary set).
    const rawFallback = (channelSettings["fallbackChannels"] ?? []) as unknown;
    const fallbackChannels: string[] = Array.isArray(rawFallback)
      ? (rawFallback as unknown[]).filter((c): c is string => typeof c === "string")
      : [];

    for (const group of groups.values()) {
      const channelMessage = buildChannelMessage(group.hits, group.channels, userTemplates, userRow.name);
      const dispatch = await dispatchToChannels(
        { mailer: deps.mailer },
        group.channels,
        channelSettings,
        userRow.email,
        channelMessage,
      );
      allDispatchResults.push(...dispatch.results);
      if (dispatch.anySuccess) {
        anySuccessAcross = true;
        continue;
      }

      // Primary group failed entirely — try fallback channels not already in the
      // failing set so we don't just retry the same channel.
      const remainingFallback = fallbackChannels.filter((c) => !group.channels.includes(c));
      if (remainingFallback.length === 0) continue;

      const fallbackDispatch = await dispatchToChannels(
        { mailer: deps.mailer },
        remainingFallback,
        channelSettings,
        userRow.email,
        channelMessage,
        { markAsFallback: true },
      );
      allDispatchResults.push(...fallbackDispatch.results);
      if (fallbackDispatch.anySuccess) anySuccessAcross = true;
    }

    if (!anySuccessAcross && allDispatchResults.length > 0) {
      const errors = allDispatchResults
        .filter((r) => !r.success)
        .map((r) => `${r.channel}: ${r.error}`)
        .join("; ");
      await upsertJob(deps.db, userRow.id, {
        ...jobPayload,
        status: "failed",
        lastError: errors,
        result: { hits, channelResults: allDispatchResults },
      });
      results.push({ userId: userRow.id, action: "failed", reason: "all_channels_failed", hits });
      continue;
    }

    await upsertJob(deps.db, userRow.id, {
      ...jobPayload,
      status: "sent",
      lastError: "",
      result: { hits, channelResults: allDispatchResults },
    });
    results.push({ userId: userRow.id, action: "sent", hits });
  }

  return summarize(results);
}

type TemplateRow = typeof notificationTemplates.$inferSelect;

/**
 * Pick the best matching template for a given hit/channel pair.
 *
 * Priority: subscription scope > channel scope > global scope.
 * Within the same scope, any matching row wins (UI prevents duplicates).
 */
export function pickTemplate(
  templates: TemplateRow[],
  subscriptionId: string,
  channel: string,
): TemplateRow | undefined {
  const subScoped = templates.find(
    (t) => t.scope === "subscription" && t.scopeId === subscriptionId,
  );
  if (subScoped) return subScoped;
  const channelScoped = templates.find((t) => t.scope === "channel" && t.scopeId === channel);
  if (channelScoped) return channelScoped;
  return templates.find((t) => t.scope === "global");
}

/**
 * Build the channel message for a group of hits. Uses notificationTemplates
 * when available; otherwise emits the legacy English aggregated format.
 */
export function buildChannelMessage(
  groupedHits: Array<{ hit: NotificationHit; sub: Subscription | undefined }>,
  channels: string[],
  templates: TemplateRow[],
  userName: string,
): ChannelMessage {
  // If every hit can find a template, render per-hit lines using it; otherwise
  // fall back to the legacy English aggregate to avoid losing readability.
  const primaryChannel = channels[0] ?? "";
  const renderedLines: string[] = [];
  const titleAccumulator: string[] = [];
  let usedTemplate = false;

  for (const { hit, sub } of groupedHits) {
    const template = pickTemplate(templates, hit.subscriptionId, primaryChannel);
    if (!template || !sub) continue;
    const variables = buildTemplateVariables(
      {
        name: sub.name,
        price: sub.price,
        currency: sub.currency,
        nextBillingDate: sub.nextBillingDate,
        category: sub.category,
        paymentMethod: sub.paymentMethod ?? "",
      },
      hit.daysUntil,
      userName,
    );
    titleAccumulator.push(renderTemplate(template.titleTemplate, variables));
    renderedLines.push(renderTemplate(template.bodyTemplate, variables));
    usedTemplate = true;
  }

  if (usedTemplate && renderedLines.length > 0) {
    return {
      title: titleAccumulator.length === 1
        ? titleAccumulator[0]!
        : `Qreminder · ${groupedHits.length} reminders`,
      body: renderedLines.join("\n\n"),
    };
  }

  // Legacy aggregated format — kept identical to pre-v3.3 behavior.
  const renewalHits = groupedHits.filter(({ hit }) => hit.kind === "renewal").map(({ hit }) => hit);
  const trialHits = groupedHits.filter(({ hit }) => hit.kind === "trial").map(({ hit }) => hit);
  const titleParts: string[] = [];
  if (trialHits.length > 0) titleParts.push(`${trialHits.length} trial ending`);
  if (renewalHits.length > 0) titleParts.push(`${renewalHits.length} renewal${renewalHits.length === 1 ? "" : "s"}`);
  const bodyParts: string[] = [];
  if (trialHits.length > 0) {
    bodyParts.push(
      "⚠️ Trial ending soon (will start charging if not cancelled):",
      ...trialHits.map(
        (h) => `  • ${h.subscriptionName} — ${h.daysUntil === 0 ? "today" : `in ${h.daysUntil} day${h.daysUntil === 1 ? "" : "s"}`}`,
      ),
    );
  }
  if (renewalHits.length > 0) {
    if (bodyParts.length > 0) bodyParts.push("");
    bodyParts.push(
      "Upcoming renewals:",
      ...renewalHits.map(
        (h) => `  • ${h.subscriptionName} — ${h.daysUntil === 0 ? "today" : `in ${h.daysUntil} day${h.daysUntil === 1 ? "" : "s"}`}`,
      ),
    );
  }
  return {
    title: `Qreminder · ${titleParts.join(", ") || `${groupedHits.length} reminders`}`,
    body: bodyParts.length > 0 ? bodyParts.join("\n") : "No reminders",
  };
}

async function findJob(
  db: Database,
  userId: string,
  decision: { scheduledLocalDate: string; scheduledLocalTime: string; timeZone: string },
) {
  const [row] = await db
    .select()
    .from(notificationJobs)
    .where(
      and(
        eq(notificationJobs.user, userId),
        eq(notificationJobs.scheduledLocalDate, decision.scheduledLocalDate),
        eq(notificationJobs.scheduledLocalTime, decision.scheduledLocalTime),
        eq(notificationJobs.timeZone, decision.timeZone),
      ),
    );
  return row;
}

interface JobUpsertPayload {
  scheduledLocalDate: string;
  scheduledLocalTime: string;
  timeZone: string;
  scheduledInstantUtc: string;
  attempts: number;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  lastError: string;
  result: Record<string, unknown>;
  updatedAt: string;
}

async function upsertJob(db: Database, userId: string, payload: JobUpsertPayload) {
  const existing = await findJob(db, userId, payload);
  if (existing) {
    await db
      .update(notificationJobs)
      .set({
        scheduledInstantUtc: payload.scheduledInstantUtc,
        attempts: payload.attempts,
        status: payload.status,
        lastError: payload.lastError,
        result: payload.result,
        updatedAt: payload.updatedAt,
      })
      .where(eq(notificationJobs.id, existing.id));
    return;
  }
  await db.insert(notificationJobs).values({
    id: crypto.randomUUID(),
    user: userId,
    scheduledLocalDate: payload.scheduledLocalDate,
    scheduledLocalTime: payload.scheduledLocalTime,
    timeZone: payload.timeZone,
    scheduledInstantUtc: payload.scheduledInstantUtc,
    attempts: payload.attempts,
    status: payload.status,
    lastError: payload.lastError,
    result: payload.result,
    createdAt: payload.updatedAt,
    updatedAt: payload.updatedAt,
  });
}

function summarize(results: NotificationCronUserResult[]): NotificationCronResult {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of results) {
    if (r.action === "sent") sent++;
    else if (r.action === "skipped") skipped++;
    else failed++;
  }
  return {
    processed: results.length,
    sent,
    skipped,
    failed,
    results,
  };
}
