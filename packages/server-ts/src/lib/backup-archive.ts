import { and, eq, sql } from "drizzle-orm";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  budgets,
  customConfigs,
  notificationTemplates,
  settings,
  subscriptionNotificationChannels,
  subscriptionPayments,
  subscriptionPriceHistory,
  subscriptions,
} from "../db/schema.js";
import type { Database } from "../db/types.js";
import {
  budgetRestoreKey,
  normalizeCycle,
  normalizeScopeType,
  normalizeStatus,
  normalizeTemplateScope,
  paymentRestoreKey,
  stripSensitiveSettings,
  templateRestoreKey,
} from "./backup-archive-helpers.js";

export { SENSITIVE_SETTING_KEYS, stripSensitiveSettings } from "./backup-archive-helpers.js";

export class BackupArchiveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export interface BackupMetadataOptions {
  version?: string;
  source?: string;
}

export interface BackupRestoreResult {
  subscriptions: number;
  payments: number;
  budgets: number;
  templates: number;
  notificationChannels: number;
  priceHistory: number;
  settings: number;
  customConfig: number;
}

export async function buildWorkspaceBackupArchive(
  db: Database,
  userId: string,
  workspaceId: string,
  metadataOptions: BackupMetadataOptions = {},
): Promise<Uint8Array> {
  const [
    userSubs,
    userSettings,
    userConfig,
    userPayments,
    userBudgets,
    userTemplates,
    userChannels,
    userPriceHistory,
  ] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)),
    db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId))),
    db.select().from(customConfigs).where(and(eq(customConfigs.user, userId), eq(customConfigs.workspaceId, workspaceId))),
    db.select().from(subscriptionPayments).where(eq(subscriptionPayments.workspaceId, workspaceId)),
    db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId)),
    db.select().from(notificationTemplates).where(eq(notificationTemplates.workspaceId, workspaceId)),
    db.select().from(subscriptionNotificationChannels).where(eq(subscriptionNotificationChannels.workspaceId, workspaceId)),
    db.select().from(subscriptionPriceHistory).where(eq(subscriptionPriceHistory.workspaceId, workspaceId)),
  ]);

  const settingsData = (userSettings[0]?.settings ?? {}) as Record<string, unknown>;
  const metadata = {
    app: "Qreminder",
    version: metadataOptions.version ?? "3.1.0",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    ...(metadataOptions.source ? { source: metadataOptions.source } : {}),
  };

  const files: Record<string, Uint8Array> = {
    "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
    "subscriptions.json": strToU8(JSON.stringify(userSubs, null, 2)),
    "payments.json": strToU8(JSON.stringify(userPayments, null, 2)),
    "settings.json": strToU8(JSON.stringify(stripSensitiveSettings(settingsData), null, 2)),
    "custom-config.json": strToU8(JSON.stringify(userConfig[0]?.config ?? {}, null, 2)),
    "budgets.json": strToU8(JSON.stringify(userBudgets, null, 2)),
    "templates.json": strToU8(JSON.stringify(userTemplates, null, 2)),
    "notification-channels.json": strToU8(JSON.stringify(userChannels, null, 2)),
    "price-history.json": strToU8(JSON.stringify(userPriceHistory, null, 2)),
  };

  return zipSync(files, { level: 6 });
}

export async function restoreWorkspaceBackupArchive(
  db: Database,
  userId: string,
  workspaceId: string,
  body: ArrayBuffer | Uint8Array,
): Promise<BackupRestoreResult> {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupArchiveError("invalid_zip", "Cannot parse ZIP file");
  }

  const metadata = readJsonFile<Record<string, unknown>>(files, "metadata.json", true)!;
  if (metadata["app"] !== "Qreminder") {
    throw new BackupArchiveError("not_qreminder", "Not a Qreminder backup");
  }
  validateRestoreFileShapes(files);

  return runRestoreTransaction(db, async () => {
    const now = new Date().toISOString();
    const imported: BackupRestoreResult = {
      subscriptions: 0,
      payments: 0,
      budgets: 0,
      templates: 0,
      notificationChannels: 0,
      priceHistory: 0,
      settings: 0,
      customConfig: 0,
    };
    const subIdMap = new Map<string, string>();

    await restoreSettings(db, userId, workspaceId, files, now, imported);
    await restoreCustomConfig(db, userId, workspaceId, files, now, imported);
    await restoreSubscriptions(db, userId, workspaceId, files, now, imported, subIdMap);
    await restorePayments(db, userId, workspaceId, files, now, imported, subIdMap);
    await restoreBudgets(db, userId, workspaceId, files, now, imported);
    await restoreTemplates(db, userId, workspaceId, files, now, imported, subIdMap);
    await restoreNotificationChannels(db, userId, workspaceId, files, now, imported, subIdMap);
    await restorePriceHistory(db, userId, workspaceId, files, imported, subIdMap);

    return imported;
  });
}

export function totalRestoredCount(result: BackupRestoreResult): number {
  return Object.values(result).reduce((sum, value) => sum + value, 0);
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function readJsonFile<T>(
  files: Record<string, Uint8Array>,
  name: string,
  required = false,
): T | null {
  const raw = files[name];
  if (!raw) {
    if (required) throw new BackupArchiveError("invalid_backup", `Missing ${name}`);
    return null;
  }
  try {
    return JSON.parse(strFromU8(raw)) as T;
  } catch {
    throw new BackupArchiveError("invalid_backup", `Cannot parse ${name}`);
  }
}

function validateRestoreFileShapes(files: Record<string, Uint8Array>): void {
  for (const name of [
    "subscriptions.json",
    "payments.json",
    "budgets.json",
    "templates.json",
    "notification-channels.json",
    "subscription-notification-channels.json",
    "price-history.json",
  ]) {
    const value = readJsonFile<unknown>(files, name);
    if (value !== null && !Array.isArray(value)) {
      throw new BackupArchiveError("invalid_backup", `${name} must contain an array`);
    }
  }

  for (const name of ["settings.json", "custom-config.json", "custom-configs.json"]) {
    const value = readJsonFile<unknown>(files, name);
    if (value !== null && !isRecord(value) && !Array.isArray(value)) {
      throw new BackupArchiveError("invalid_backup", `${name} must contain an object`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function runRestoreTransaction<T>(db: Database, work: () => Promise<T>): Promise<T> {
  const savepointName = `restore_${crypto.randomUUID().replace(/-/g, "")}`;
  await runRestoreSql(db, `savepoint ${savepointName}`);
  try {
    const result = await work();
    await runRestoreSql(db, `release savepoint ${savepointName}`);
    return result;
  } catch (err) {
    try {
      await runRestoreSql(db, `rollback to savepoint ${savepointName}`);
    } catch {
      // Preserve the original restore error if rollback itself fails.
    }
    try {
      await runRestoreSql(db, `release savepoint ${savepointName}`);
    } catch {
      // A failed rollback may already invalidate the savepoint.
    }
    throw err;
  }
}

async function runRestoreSql(db: Database, statement: string): Promise<void> {
  await Promise.resolve(db.run(sql.raw(statement)) as unknown);
}

function pickJsonObject(raw: unknown, fieldName?: string): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    const row = raw.find((item) => isRecord(item) && (!fieldName || isRecord(item[fieldName])));
    if (!row || !isRecord(row)) return null;
    const value = fieldName ? row[fieldName] : row;
    return isRecord(value) ? value : null;
  }
  return isRecord(raw) ? raw : null;
}

async function restoreSettings(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  now: string,
  imported: BackupRestoreResult,
) {
  const raw = readJsonFile<unknown>(files, "settings.json");
  const payload = pickJsonObject(raw, "settings");
  if (!payload) return;

  const [existing] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const merged = { ...((existing?.settings as Record<string, unknown> | undefined) ?? {}), ...payload };

  if (!existing) {
    await db.insert(settings).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      settings: merged,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db.update(settings).set({ settings: merged, updatedAt: now }).where(eq(settings.id, existing.id));
  }
  imported.settings = 1;
}

async function restoreCustomConfig(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  now: string,
  imported: BackupRestoreResult,
) {
  const raw = readJsonFile<unknown>(files, "custom-config.json") ?? readJsonFile<unknown>(files, "custom-configs.json");
  const payload = pickJsonObject(raw, "config");
  if (!payload) return;

  const [existing] = await db
    .select()
    .from(customConfigs)
    .where(and(eq(customConfigs.user, userId), eq(customConfigs.workspaceId, workspaceId)));
  const merged = { ...((existing?.config as Record<string, unknown> | undefined) ?? {}), ...payload };

  if (!existing) {
    await db.insert(customConfigs).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      config: merged,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db.update(customConfigs).set({ config: merged, updatedAt: now }).where(eq(customConfigs.id, existing.id));
  }
  imported.customConfig = 1;
}

async function restoreSubscriptions(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  now: string,
  imported: BackupRestoreResult,
  subIdMap: Map<string, string>,
) {
  const subs = readJsonFile<Array<Record<string, unknown>>>(files, "subscriptions.json") ?? [];
  const existingByName = new Map(
    (await db.select({ id: subscriptions.id, name: subscriptions.name }).from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)))
      .map((s) => [s.name.toLowerCase(), s.id] as const),
  );

  for (const sub of subs) {
    const oldId = String(sub["id"] ?? "");
    const name = String(sub["name"] ?? "");
    if (!name) continue;
    const existingId = existingByName.get(name.toLowerCase());
    if (existingId) {
      if (oldId) subIdMap.set(oldId, existingId);
      continue;
    }
    const newId = crypto.randomUUID();
    if (oldId) subIdMap.set(oldId, newId);
    await db.insert(subscriptions).values({
      id: newId,
      user: userId,
      workspaceId,
      name,
      logo: String(sub["logo"] ?? ""),
      price: Number(sub["price"] ?? 0),
      currency: String(sub["currency"] ?? "CNY"),
      billingCycle: normalizeCycle(sub["billingCycle"]),
      customDays: sub["customDays"] != null ? Number(sub["customDays"]) : null,
      category: String(sub["category"] ?? ""),
      status: normalizeStatus(sub["status"]),
      paymentMethod: String(sub["paymentMethod"] ?? ""),
      startDate: String(sub["startDate"] ?? now.slice(0, 10)),
      nextBillingDate: String(sub["nextBillingDate"] ?? now.slice(0, 10)),
      autoCalculateNextBillingDate: Boolean(sub["autoCalculateNextBillingDate"] ?? true),
      trialEndDate: sub["trialEndDate"] ? String(sub["trialEndDate"]) : null,
      website: sub["website"] ? String(sub["website"]) : null,
      notes: String(sub["notes"] ?? ""),
      tags: Array.isArray(sub["tags"]) ? sub["tags"] as string[] : [],
      extra: isRecord(sub["extra"]) ? sub["extra"] : {},
      reminderDays: Number(sub["reminderDays"] ?? 3),
      reminderOffsets: Array.isArray(sub["reminderOffsets"]) ? sub["reminderOffsets"] as number[] : [3],
      createdAt: now,
      updatedAt: now,
    });
    existingByName.set(name.toLowerCase(), newId);
    imported.subscriptions++;
  }
}

async function restorePayments(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  now: string,
  imported: BackupRestoreResult,
  subIdMap: Map<string, string>,
) {
  const payments = readJsonFile<Array<Record<string, unknown>>>(files, "payments.json") ?? [];
  const existing = await db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.workspaceId, workspaceId));
  const existingKeys = new Set(existing.map(paymentRestoreKey));

  for (const p of payments) {
    const rawSubId = String(p["subscriptionId"] ?? p["subscription_id"] ?? "");
    const mappedSubId = subIdMap.get(rawSubId) ?? null;
    const payment = {
      subscriptionId: mappedSubId,
      subscriptionName: String(p["subscriptionName"] ?? p["subscription_name"] ?? ""),
      paidAt: String(p["paidAt"] ?? p["paid_at"] ?? now.slice(0, 10)),
      amount: Number(p["amount"] ?? 0),
      currency: String(p["currency"] ?? "CNY"),
      billingPeriod: p["billingPeriod"] ? String(p["billingPeriod"]) : null,
      paymentMethod: p["paymentMethod"] ? String(p["paymentMethod"]) : null,
      note: String(p["note"] ?? ""),
    };
    const key = paymentRestoreKey(payment);
    if (existingKeys.has(key)) continue;

    await db.insert(subscriptionPayments).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      ...payment,
      createdAt: now,
      updatedAt: now,
    });
    existingKeys.add(key);
    imported.payments++;
  }
}

async function restoreBudgets(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  now: string,
  imported: BackupRestoreResult,
) {
  const budgetList = readJsonFile<Array<Record<string, unknown>>>(files, "budgets.json") ?? [];
  const existing = await db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId));
  const existingKeys = new Set(existing.map(budgetRestoreKey));

  for (const b of budgetList) {
    const budget = {
      scopeType: normalizeScopeType(b["scopeType"] ?? b["scope_type"]),
      scopeId: String(b["scopeId"] ?? b["scope_id"] ?? ""),
      period: (b["period"] === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly",
      amount: Number(b["amount"] ?? 0),
      currency: String(b["currency"] ?? "CNY"),
      enabled: Boolean(b["enabled"] ?? true),
    };
    const key = budgetRestoreKey(budget);
    if (existingKeys.has(key)) continue;

    await db.insert(budgets).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      ...budget,
      createdAt: now,
      updatedAt: now,
    });
    existingKeys.add(key);
    imported.budgets++;
  }
}

async function restoreTemplates(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  now: string,
  imported: BackupRestoreResult,
  subIdMap: Map<string, string>,
) {
  const tpls = readJsonFile<Array<Record<string, unknown>>>(files, "templates.json") ?? [];
  const existing = await db
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.workspaceId, workspaceId));
  const existingKeys = new Set(existing.map(templateRestoreKey));

  for (const tpl of tpls) {
    const scope = normalizeTemplateScope(tpl["scope"]);
    const rawScopeId = String(tpl["scopeId"] ?? tpl["scope_id"] ?? "");
    const scopeId = scope === "subscription" ? (subIdMap.get(rawScopeId) ?? rawScopeId) : rawScopeId;
    const template = {
      scope,
      scopeId,
      titleTemplate: String(tpl["titleTemplate"] ?? tpl["title_template"] ?? ""),
      bodyTemplate: String(tpl["bodyTemplate"] ?? tpl["body_template"] ?? ""),
    };
    const key = templateRestoreKey(template);
    if (existingKeys.has(key)) continue;

    await db.insert(notificationTemplates).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      ...template,
      createdAt: now,
      updatedAt: now,
    });
    existingKeys.add(key);
    imported.templates++;
  }
}

async function restoreNotificationChannels(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  now: string,
  imported: BackupRestoreResult,
  subIdMap: Map<string, string>,
) {
  const rows = readJsonFile<Array<Record<string, unknown>>>(files, "notification-channels.json")
    ?? readJsonFile<Array<Record<string, unknown>>>(files, "subscription-notification-channels.json")
    ?? [];
  const existing = await db
    .select()
    .from(subscriptionNotificationChannels)
    .where(eq(subscriptionNotificationChannels.workspaceId, workspaceId));
  const existingKeys = new Set(existing.map((row) => `${row.subscriptionId}|${row.channel}`));

  for (const row of rows) {
    const rawSubId = String(row["subscriptionId"] ?? row["subscription_id"] ?? "");
    const subscriptionId = subIdMap.get(rawSubId);
    const channel = String(row["channel"] ?? "").trim();
    if (!subscriptionId || !channel) continue;
    const key = `${subscriptionId}|${channel}`;
    if (existingKeys.has(key)) continue;
    await db.insert(subscriptionNotificationChannels).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      subscriptionId,
      channel,
      createdAt: now,
    });
    existingKeys.add(key);
    imported.notificationChannels++;
  }
}

async function restorePriceHistory(
  db: Database,
  userId: string,
  workspaceId: string,
  files: Record<string, Uint8Array>,
  imported: BackupRestoreResult,
  subIdMap: Map<string, string>,
) {
  const rows = readJsonFile<Array<Record<string, unknown>>>(files, "price-history.json") ?? [];
  const existing = await db
    .select()
    .from(subscriptionPriceHistory)
    .where(eq(subscriptionPriceHistory.workspaceId, workspaceId));
  const existingKeys = new Set(
    existing.map((row) => [
      row.subscriptionId,
      row.changedAt,
      row.oldPrice,
      row.newPrice,
      row.oldCurrency,
      row.newCurrency,
    ].join("|")),
  );

  for (const row of rows) {
    const rawSubId = String(row["subscriptionId"] ?? row["subscription_id"] ?? "");
    const subscriptionId = subIdMap.get(rawSubId);
    if (!subscriptionId) continue;
    const changedAt = String(row["changedAt"] ?? row["changed_at"] ?? new Date().toISOString());
    const oldPrice = Number(row["oldPrice"] ?? row["old_price"] ?? 0);
    const newPrice = Number(row["newPrice"] ?? row["new_price"] ?? 0);
    const oldCurrency = String(row["oldCurrency"] ?? row["old_currency"] ?? "CNY");
    const newCurrency = String(row["newCurrency"] ?? row["new_currency"] ?? "CNY");
    const key = [subscriptionId, changedAt, oldPrice, newPrice, oldCurrency, newCurrency].join("|");
    if (existingKeys.has(key)) continue;
    await db.insert(subscriptionPriceHistory).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      subscriptionId,
      oldPrice,
      newPrice,
      oldCurrency,
      newCurrency,
      changedAt,
    });
    existingKeys.add(key);
    imported.priceHistory++;
  }
}
