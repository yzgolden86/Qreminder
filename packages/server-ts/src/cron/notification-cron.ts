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
  users,
} from "../db/schema.js";
import type { Database } from "../db/types.js";
import type { MailerAdapter } from "../adapters/mailer.js";
import { dispatchToChannels, type ChannelMessage } from "./channel-dispatcher.js";

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

    const channelMessage: ChannelMessage = {
      title: `Qreminder · ${hits.length} reminder${hits.length === 1 ? "" : "s"}`,
      body: hits
        .map((h) => `${h.subscriptionName}: ${h.daysUntil} days (${h.kind})`)
        .join("\n"),
    };

    const channelSettings = (settings as unknown as Record<string, unknown>);
    const dispatch = await dispatchToChannels(
      { mailer: deps.mailer },
      settings.enabledChannels,
      channelSettings,
      userRow.email,
      channelMessage,
    );

    if (!dispatch.anySuccess && dispatch.results.length > 0) {
      const errors = dispatch.results
        .filter((r) => !r.success)
        .map((r) => `${r.channel}: ${r.error}`)
        .join("; ");
      await upsertJob(deps.db, userRow.id, {
        ...jobPayload,
        status: "failed",
        lastError: errors,
        result: { hits, channelResults: dispatch.results },
      });
      results.push({ userId: userRow.id, action: "failed", reason: "all_channels_failed", hits });
      continue;
    }

    await upsertJob(deps.db, userRow.id, {
      ...jobPayload,
      status: "sent",
      lastError: "",
      result: { hits, channelResults: dispatch.results },
    });
    results.push({ userId: userRow.id, action: "sent", hits });
  }

  return summarize(results);
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
