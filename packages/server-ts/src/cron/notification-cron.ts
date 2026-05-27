import { and, eq, sql } from "drizzle-orm";
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
  workspaceMembers,
} from "../db/schema.js";
import type { Database } from "../db/types.js";
import type { MailerAdapter } from "../adapters/mailer.js";
import { dispatchToChannels, type ChannelMessage, type ChannelSendResult } from "./channel-dispatcher.js";
import {
  resolveChannelsForSubscription,
  renderTemplate,
  buildTemplateVariables,
} from "./channel-resolver.js";
import {
  buildDefaultChannelMessage,
  buildPlainEmailHtml,
  type GroupedNotificationHit,
} from "./notification-message.js";

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
  workspaceId?: string | null;
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

function workspaceKey(workspaceId: string | null, userId: string): string {
  return workspaceId ?? `legacy-user:${userId}`;
}

export async function runNotificationCron(
  deps: CronDeps,
  options: NotificationCronOptions = {},
): Promise<NotificationCronResult> {
  const opts = resolveOptions(options);
  const allUsers = await deps.db.select().from(users);
  const allSettingsRows = await deps.db.select().from(settingsTable);
  const allSubscriptions = await deps.db.select().from(subscriptionsTable);
  const allMemberships = await deps.db.select().from(workspaceMembers);

  const usersById = new Map(allUsers.map((user) => [user.id, user]));
  const membershipKeys = new Set(allMemberships.map((m) => `${m.workspaceId}:${m.userId}`));
  const usersWithSettings = new Set(allSettingsRows.map((row) => row.user));

  const subsByWorkspace = new Map<string, Subscription[]>();
  for (const row of allSubscriptions) {
    const key = workspaceKey(row.workspaceId ?? null, row.user);
    const existing = subsByWorkspace.get(key) ?? [];
    existing.push(rowToSubscription(row));
    subsByWorkspace.set(key, existing);
  }

  const results: NotificationCronUserResult[] = [];
  const contexts = [
    ...allSettingsRows.map((row) => ({
      userId: row.user,
      workspaceId: row.workspaceId ?? null,
      settings: mergeSettings((row.settings as Record<string, unknown>) ?? {}),
    })),
    ...allUsers
      .filter((user) => !usersWithSettings.has(user.id))
      .map((user) => ({
        userId: user.id,
        workspaceId: null,
        settings: defaultSettings,
      })),
  ];

  for (const context of contexts) {
    const userRow = usersById.get(context.userId);
    if (!userRow) {
      results.push({
        userId: context.userId,
        workspaceId: context.workspaceId,
        action: "skipped",
        reason: "user_not_found",
      });
      continue;
    }
    if (userRow.banned) {
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "skipped", reason: "user_banned" });
      continue;
    }
    if (context.workspaceId && !membershipKeys.has(`${context.workspaceId}:${userRow.id}`)) {
      results.push({
        userId: userRow.id,
        workspaceId: context.workspaceId,
        action: "skipped",
        reason: "workspace_access_removed",
      });
      continue;
    }
    const settings = context.settings;
    const decision = getLocalScheduleDecision(
      opts.now,
      settings.timezone,
      settings.notificationTimeLocal,
      opts.windowMinutes,
      opts.force,
    );
    if (!decision.due) {
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "skipped", reason: decision.reason });
      continue;
    }
    if (settings.enabledChannels.length === 0) {
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "skipped", reason: "no_enabled_channels" });
      continue;
    }

    const userSubs = subsByWorkspace.get(workspaceKey(context.workspaceId, userRow.id)) ?? [];
    const hits = matchReminderHits({
      subscriptions: userSubs,
      todayLocal: decision.scheduledLocalDate,
    });
    if (hits.length === 0 && !opts.force) {
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "skipped", reason: "no_due_items" });
      continue;
    }

    if (opts.dryRun) {
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "sent", reason: "dry_run", hits });
      continue;
    }

    const existingJob = await findJob(deps.db, userRow.id, context.workspaceId, decision);
    if (existingJob && (existingJob.status === "sent" || existingJob.status === "skipped")) {
      results.push({
        userId: userRow.id,
        workspaceId: context.workspaceId,
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
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "skipped", reason: "max_retries_reached" });
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
    const groups = new Map<string, { channels: string[]; hits: GroupedNotificationHit[] }>();

    for (const hit of hits) {
      const sub = subById.get(hit.subscriptionId);
      const resolution = await resolveChannelsForSubscription(
        deps.db,
        userRow.id,
        context.workspaceId,
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
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "skipped", reason: "no_resolved_channels" });
      continue;
    }

    // Load templates once per workspace — we pick the best match per hit below.
    const userTemplates = await deps.db
      .select()
      .from(notificationTemplates)
      .where(
        context.workspaceId
          ? eq(notificationTemplates.workspaceId, context.workspaceId)
          : and(eq(notificationTemplates.user, userRow.id), sql`${notificationTemplates.workspaceId} IS NULL`),
      );

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
        workspaceId: context.workspaceId,
        ...jobPayload,
        status: "failed",
        lastError: errors,
        result: { hits, channelResults: allDispatchResults },
      });
      results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "failed", reason: "all_channels_failed", hits });
      continue;
    }

    await upsertJob(deps.db, userRow.id, {
      workspaceId: context.workspaceId,
      ...jobPayload,
      status: "sent",
      lastError: "",
      result: { hits, channelResults: allDispatchResults },
    });
    results.push({ userId: userRow.id, workspaceId: context.workspaceId, action: "sent", hits });
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
 * when available; otherwise emits a richer actionable default message.
 */
export function buildChannelMessage(
  groupedHits: GroupedNotificationHit[],
  channels: string[],
  templates: TemplateRow[],
  userName: string,
): ChannelMessage {
  // If every hit can find a template, render per-hit lines using it; otherwise
  // fall back to the richer default message so reminders stay actionable.
  const primaryChannel = channels[0] ?? "";
  const renderedLines: string[] = [];
  const titleAccumulator: string[] = [];

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
        website: sub.website ?? "",
      },
      hit.daysUntil,
      userName,
    );
    titleAccumulator.push(renderTemplate(template.titleTemplate, variables));
    renderedLines.push(renderTemplate(template.bodyTemplate, variables));
  }

  if (renderedLines.length === groupedHits.length && renderedLines.length > 0) {
    const title = titleAccumulator.length === 1
      ? titleAccumulator[0]!
      : `Qreminder · ${groupedHits.length} reminders`;
    return {
      title,
      body: renderedLines.join("\n\n"),
      html: buildPlainEmailHtml(title, renderedLines.join("\n\n")),
    };
  }

  return buildDefaultChannelMessage(groupedHits);
}

async function findJob(
  db: Database,
  userId: string,
  workspaceId: string | null,
  decision: { scheduledLocalDate: string; scheduledLocalTime: string; timeZone: string },
) {
  const [row] = await db
    .select()
    .from(notificationJobs)
    .where(
      and(
        eq(notificationJobs.user, userId),
        workspaceId
          ? eq(notificationJobs.workspaceId, workspaceId)
          : sql`${notificationJobs.workspaceId} IS NULL`,
        eq(notificationJobs.scheduledLocalDate, decision.scheduledLocalDate),
        eq(notificationJobs.scheduledLocalTime, decision.scheduledLocalTime),
        eq(notificationJobs.timeZone, decision.timeZone),
      ),
    );
  return row;
}

interface JobUpsertPayload {
  workspaceId: string | null;
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
  const existing = await findJob(db, userId, payload.workspaceId, payload);
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
    workspaceId: payload.workspaceId,
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
