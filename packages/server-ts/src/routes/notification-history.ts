import { and, desc, eq } from "drizzle-orm";
import {
  addDateOnly,
  getNextLocalScheduleOccurrence,
  getScheduleInstant,
  matchReminderHits,
  todayDateOnly,
  type NotificationHit,
  type Settings,
  type Subscription,
} from "@qreminder/shared";
import {
  notificationJobs,
  settings as settingsTable,
  subscriptions as subscriptionsTable,
} from "../db/schema.js";
import type { Database } from "../db/types.js";

const NOTIFICATION_CHANNELS = ["telegram", "notifyx", "webhook", "wechat", "email", "bark", "serverchan"] as const;
type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
type JobStatus = "pending" | "sending" | "sent" | "failed" | "skipped";
type HistoryStatus = "all" | "sent" | "failed" | "skipped" | "sending";
type Locale = "zh-CN" | "en-US";
type JobRow = typeof notificationJobs.$inferSelect;
type SubscriptionRow = typeof subscriptionsTable.$inferSelect;

const channelSet = new Set<string>(NOTIFICATION_CHANNELS);
const historyStatusSet = new Set<string>(["all", "sent", "failed", "skipped", "sending"]);
const DEFAULT_UPCOMING_DAYS = 30;

const defaultSettings: Settings & { showExpired: boolean } = {
  user: "",
  timezone: "Asia/Shanghai",
  notificationTimeLocal: "09:00",
  enabledChannels: [],
  locale: "zh-CN",
  signupEnabled: false,
  signupAllowlist: [],
  channels: {},
  showExpired: true,
};

interface NormalizedSettings {
  raw: Record<string, unknown>;
  timezone: string;
  notificationTimeLocal: string;
  enabledChannels: NotificationChannel[];
  locale: Locale;
  showExpired: boolean;
}

export interface NotificationHistoryQuery {
  status?: string | null | undefined;
  limit?: string | null | undefined;
  offset?: string | null | undefined;
}

export async function buildNotificationHistoryPayload(
  db: Database,
  userId: string,
  workspaceId: string,
  query: NotificationHistoryQuery,
  now = new Date(),
) {
  const settings = await readSettings(db, userId, workspaceId);
  const subscriptions = await readSubscriptions(db, userId, workspaceId);
  const subById = new Map(subscriptions.map((sub) => [sub.id, sub]));
  const upcomingDays = DEFAULT_UPCOMING_DAYS;
  const upcoming = buildUpcomingBatches(subscriptions, settings, now, upcomingDays);
  const historyStatus = normalizeHistoryStatus(query.status);
  const limit = normalizeInt(query.limit, 20, 1, 100);
  const offset = normalizeInt(query.offset, 0, 0, 100_000);
  const baseWhere = and(
    eq(notificationJobs.user, userId),
    eq(notificationJobs.workspaceId, workspaceId),
  );
  const historyWhere = historyStatus === "all"
    ? baseWhere
    : and(baseWhere, eq(notificationJobs.status, historyStatus));

  const [historyRows, latestRows, latestFailedRows] = await Promise.all([
    db
      .select()
      .from(notificationJobs)
      .where(historyWhere)
      .orderBy(desc(notificationJobs.updatedAt))
      .limit(limit + 1)
      .offset(offset),
    db
      .select()
      .from(notificationJobs)
      .where(baseWhere)
      .orderBy(desc(notificationJobs.updatedAt))
      .limit(1),
    db
      .select()
      .from(notificationJobs)
      .where(and(baseWhere, eq(notificationJobs.status, "failed")))
      .orderBy(desc(notificationJobs.updatedAt))
      .limit(1),
  ]);

  const jobs = historyRows
    .slice(0, limit)
    .map((row) => toHistoryJob(row, settings, subById));
  const latestJob = latestRows[0] ? toHistoryJob(latestRows[0], settings, subById) : null;
  const latestFailedJob = latestFailedRows[0] ? toHistoryJob(latestFailedRows[0], settings, subById) : null;
  const blockers: string[] = [];
  if (settings.enabledChannels.length === 0) blockers.push("no_enabled_channels");
  if (upcoming.length === 0) blockers.push("no_upcoming_items");

  return {
    summary: {
      nextCheck: getNextLocalScheduleOccurrence(now, settings.timezone, settings.notificationTimeLocal),
      nextContentBatch: upcoming[0] ?? null,
      blockers,
      enabledChannels: settings.enabledChannels,
      upcomingDays,
      latestJob,
      latestFailedJob,
    },
    upcoming,
    history: {
      jobs,
      status: historyStatus,
      limit,
      offset,
      hasMore: historyRows.length > limit,
    },
  };
}

export async function recordNotificationTestJob(
  db: Database,
  input: {
    userId: string;
    workspaceId: string;
    channel: NotificationChannel;
    settings: Record<string, unknown>;
    status: "sent" | "failed";
    errorMessage?: string;
    deliveryId?: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const settings = normalizeSettings(input.settings);
  const scheduledLocalDate = todayDateOnly(now, settings.timezone);
  const scheduledLocalTime = currentLocalTime(now, settings.timezone);
  const schedule = {
    scheduledLocalDate,
    scheduledLocalTime,
    timeZone: settings.timezone,
    scheduledInstantUtc: now.toISOString(),
  };
  const channels = {
    attempted: [input.channel],
    succeeded: input.status === "sent" ? [input.channel] : [],
    failed: input.status === "failed"
      ? [{ channel: input.channel, error: input.errorMessage ?? "Send failed" }]
      : [],
  };
  const content = input.status === "sent"
    ? input.deliveryId
      ? `Test notification accepted by provider. Message id: ${input.deliveryId}`
      : "Test notification accepted by provider."
    : input.errorMessage ?? "Test notification failed.";
  const result = buildStandardResult({
    reason: "test_notification",
    force: true,
    windowMinutes: 0,
    triggeredAtUtc: now.toISOString(),
    schedule,
    settings,
    message: {
      title: "Qreminder · Test notification",
      content,
      timestamp: now.toISOString(),
      hasPayload: false,
      items: [],
    },
    channels,
  });

  const existing = await findJob(db, input.userId, input.workspaceId, schedule);
  if (existing) {
    await db
      .update(notificationJobs)
      .set({
        scheduledInstantUtc: schedule.scheduledInstantUtc,
        status: input.status,
        attempts: existing.attempts + 1,
        lastError: input.errorMessage ?? "",
        result,
        updatedAt: now.toISOString(),
      })
      .where(eq(notificationJobs.id, existing.id));
    return;
  }

  await db.insert(notificationJobs).values({
    id: crypto.randomUUID(),
    user: input.userId,
    workspaceId: input.workspaceId,
    ...schedule,
    status: input.status,
    attempts: 1,
    lastError: input.errorMessage ?? "",
    result,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

async function readSettings(db: Database, userId: string, workspaceId: string): Promise<NormalizedSettings> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.user, userId), eq(settingsTable.workspaceId, workspaceId)));
  return normalizeSettings((row?.settings as Record<string, unknown> | undefined) ?? {});
}

function normalizeSettings(stored: Record<string, unknown>): NormalizedSettings {
  const raw = { ...defaultSettings, ...stored };
  const timezone = safeTimeZone(typeof raw.timezone === "string" ? raw.timezone : defaultSettings.timezone);
  const notificationTimeLocal = isLocalTime(raw.notificationTimeLocal)
    ? raw.notificationTimeLocal
    : defaultSettings.notificationTimeLocal;
  const locale: Locale = raw.locale === "en-US" ? "en-US" : "zh-CN";
  const enabledChannels = normalizeChannels(raw.enabledChannels);
  return {
    raw,
    timezone,
    notificationTimeLocal,
    enabledChannels,
    locale,
    showExpired: typeof raw.showExpired === "boolean" ? raw.showExpired : true,
  };
}

async function readSubscriptions(db: Database, userId: string, workspaceId: string): Promise<Subscription[]> {
  const rows = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.user, userId), eq(subscriptionsTable.workspaceId, workspaceId)));
  return rows.map(rowToSubscription);
}

function rowToSubscription(row: SubscriptionRow): Subscription {
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

function buildUpcomingBatches(
  subscriptions: Subscription[],
  settings: NormalizedSettings,
  now: Date,
  upcomingDays: number,
) {
  const today = todayDateOnly(now, settings.timezone);
  const subById = new Map(subscriptions.map((sub) => [sub.id, sub]));
  const batches = [];
  for (let day = 0; day <= upcomingDays; day++) {
    const localDate = addDateOnly(today, day);
    const hits = matchReminderHits({ subscriptions, todayLocal: localDate });
    const items = hits
      .map((hit) => hitToContentItem(hit, subById.get(hit.subscriptionId)))
      .filter((item): item is NonNullable<typeof item> => item != null);
    if (items.length === 0) continue;
    batches.push({
      ...scheduleForDate(localDate, settings),
      items,
    });
  }
  return batches;
}

function toHistoryJob(row: JobRow, settings: NormalizedSettings, subById: Map<string, Subscription>) {
  return {
    id: row.id,
    scheduledLocalDate: row.scheduledLocalDate,
    scheduledLocalTime: row.scheduledLocalTime,
    timeZone: row.timeZone,
    scheduledInstantUtc: row.scheduledInstantUtc,
    status: row.status as JobStatus,
    attempts: row.attempts,
    lastError: row.lastError || null,
    result: normalizeStoredResult(row, settings, subById),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeStoredResult(row: JobRow, settings: NormalizedSettings, subById: Map<string, Subscription>) {
  const result = isRecord(row.result) ? row.result : {};
  const hits = extractHits(result);
  const items = hits
    .map((hit) => hitToContentItem(hit, subById.get(hit.subscriptionId)))
    .filter((item): item is NonNullable<typeof item> => item != null);
  const message = isRecord(result.message) ? result.message : {};
  const title = stringField(message.title) ?? (items.length > 0 ? "Qreminder · Subscription reminder" : "Qreminder notification");
  const content = stringField(message.content) ?? buildHistoryContent(items, row);
  return buildStandardResult({
    reason: stringField(result.reason) ?? fallbackReason(row),
    force: typeof result.force === "boolean" ? result.force : false,
    windowMinutes: numberField(result.windowMinutes) ?? 0,
    triggeredAtUtc: stringField(result.triggeredAtUtc) ?? row.updatedAt,
    schedule: {
      scheduledLocalDate: row.scheduledLocalDate,
      scheduledLocalTime: row.scheduledLocalTime,
      timeZone: row.timeZone,
      scheduledInstantUtc: row.scheduledInstantUtc,
    },
    settings,
    message: {
      title,
      content,
      timestamp: stringField(message.timestamp) ?? row.updatedAt,
      hasPayload: items.length > 0,
      items,
    },
    channels: extractChannels(result),
  });
}

function buildStandardResult(input: {
  reason: string | null;
  force: boolean;
  windowMinutes: number;
  triggeredAtUtc: string;
  schedule: {
    scheduledLocalDate: string;
    scheduledLocalTime: string;
    timeZone: string;
    scheduledInstantUtc: string;
  };
  settings: NormalizedSettings;
  message: {
    title: string;
    content: string;
    timestamp: string;
    hasPayload: boolean;
    items: ReturnType<typeof hitToContentItem>[];
  };
  channels: {
    attempted: NotificationChannel[];
    succeeded: NotificationChannel[];
    failed: Array<{ channel: NotificationChannel; error: string }>;
  };
}) {
  return {
    source: "cron" as const,
    reason: input.reason,
    force: input.force,
    windowMinutes: input.windowMinutes,
    triggeredAtUtc: input.triggeredAtUtc,
    schedule: input.schedule,
    settings: {
      timezone: input.settings.timezone,
      locale: input.settings.locale,
      notificationTimeLocal: input.settings.notificationTimeLocal,
      enabledChannels: input.settings.enabledChannels,
      showExpired: input.settings.showExpired,
    },
    message: input.message,
    channels: input.channels,
  };
}

function extractHits(result: Record<string, unknown>): NotificationHit[] {
  const rawHits = Array.isArray(result.hits) ? result.hits : [];
  return rawHits.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const subscriptionId = stringField(raw.subscriptionId);
    const subscriptionName = stringField(raw.subscriptionName) ?? "";
    const daysUntil = numberField(raw.daysUntil);
    const matchedOffset = numberField(raw.matchedOffset) ?? numberField(raw.reminderDays) ?? daysUntil;
    const kind = raw.kind === "trial" ? "trial" : raw.kind === "renewal" ? "renewal" : null;
    if (!subscriptionId || daysUntil == null || matchedOffset == null || !kind) return [];
    return [{ subscriptionId, subscriptionName, daysUntil, matchedOffset, kind }];
  });
}

function hitToContentItem(hit: NotificationHit, sub: Subscription | undefined) {
  const type = hit.kind === "trial" ? "trial" : "renewal";
  const targetDate = type === "trial" ? sub?.trialEndDate ?? sub?.nextBillingDate : sub?.nextBillingDate;
  if (!targetDate) return null;
  return {
    type,
    subscriptionId: hit.subscriptionId,
    name: sub?.name ?? hit.subscriptionName,
    price: sub?.price ?? 0,
    currency: sub?.currency ?? "CNY",
    status: sub?.status ?? "active",
    targetDate,
    reminderDays: Math.max(0, hit.matchedOffset),
    daysUntil: hit.daysUntil,
  };
}

function extractChannels(result: Record<string, unknown>) {
  const channels = isRecord(result.channels) ? result.channels : null;
  const attempted = channels ? normalizeChannels(channels.attempted) : [];
  const succeeded = channels ? normalizeChannels(channels.succeeded) : [];
  const failed = channels ? normalizeFailedChannels(channels.failed) : [];
  const channelResults = Array.isArray(result.channelResults) ? result.channelResults : [];

  for (const raw of channelResults) {
    if (!isRecord(raw)) continue;
    const channel = toChannel(raw.channel);
    if (!channel) continue;
    attempted.push(channel);
    if (raw.success === true) {
      succeeded.push(channel);
    } else {
      failed.push({ channel, error: stringField(raw.error) ?? "Send failed" });
    }
  }

  return {
    attempted: dedupe(attempted),
    succeeded: dedupe(succeeded),
    failed: dedupeFailed(failed),
  };
}

function normalizeFailedChannels(value: unknown): Array<{ channel: NotificationChannel; error: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const channel = toChannel(raw.channel);
    if (!channel) return [];
    return [{ channel, error: stringField(raw.error) ?? "Send failed" }];
  });
}

async function findJob(
  db: Database,
  userId: string,
  workspaceId: string,
  schedule: { scheduledLocalDate: string; scheduledLocalTime: string; timeZone: string },
) {
  const [row] = await db
    .select()
    .from(notificationJobs)
    .where(
      and(
        eq(notificationJobs.user, userId),
        eq(notificationJobs.workspaceId, workspaceId),
        eq(notificationJobs.scheduledLocalDate, schedule.scheduledLocalDate),
        eq(notificationJobs.scheduledLocalTime, schedule.scheduledLocalTime),
        eq(notificationJobs.timeZone, schedule.timeZone),
      ),
    );
  return row;
}

function buildHistoryContent(items: Array<NonNullable<ReturnType<typeof hitToContentItem>>>, row: JobRow): string {
  if (items.length > 0) {
    return items.map((item) => `${item.name} · ${item.targetDate}`).join("\n");
  }
  return row.lastError || (row.status === "sent" ? "Notification sent." : "No notification payload.");
}

function fallbackReason(row: JobRow): string {
  if (row.status === "failed") return row.lastError || "failed";
  if (row.status === "skipped") return row.lastError || "skipped";
  return "ok";
}

function scheduleForDate(localDate: string, settings: NormalizedSettings) {
  return {
    scheduledLocalDate: localDate,
    scheduledLocalTime: settings.notificationTimeLocal,
    timeZone: settings.timezone,
    scheduledInstantUtc: getScheduleInstant(localDate, settings.notificationTimeLocal, settings.timezone).toISOString(),
  };
}

function currentLocalTime(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function normalizeHistoryStatus(value: unknown): HistoryStatus {
  return typeof value === "string" && historyStatusSet.has(value) ? value as HistoryStatus : "all";
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function safeTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function isLocalTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeChannels(value: unknown): NotificationChannel[] {
  if (!Array.isArray(value)) return [];
  return value.map(toChannel).filter((channel): channel is NotificationChannel => channel != null);
}

function toChannel(value: unknown): NotificationChannel | null {
  return typeof value === "string" && channelSet.has(value) ? value as NotificationChannel : null;
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function dedupeFailed(items: Array<{ channel: NotificationChannel; error: string }>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.channel}:${item.error}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
