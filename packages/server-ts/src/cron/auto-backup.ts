/**
 * 自动备份 — 每日转储所有用户数据到 R2 (或任意 BackupStore)。
 *
 * 写入 ZIP（subscriptions/payments/budgets/settings/templates 等），按日期命名，
 * 并清理超过 retentionDays 天的旧备份。设计上不导出敏感凭证（webhook keys 等）。
 *
 * 单租户考虑：当前 Worker 是自托管单实例，多用户共存。备份导出所有用户的数据；
 * 个人部署也安全，因为 R2 桶受同一 Worker 控制。
 */
import { zipSync, strToU8 } from "fflate";
import {
  subscriptions,
  subscriptionPayments,
  budgets,
  notificationTemplates,
  settings as settingsTable,
  customConfigs,
  users,
  subscriptionPriceHistory,
} from "../db/schema.js";
import type { Database } from "../db/types.js";

export interface BackupStore {
  putBackup(key: string, body: Uint8Array): Promise<void>;
  listBackupKeys(prefix: string): Promise<string[]>;
  deleteBackup(key: string): Promise<void>;
}

export interface AutoBackupOptions {
  now?: Date;
  retentionDays?: number;
  prefix?: string;
}

export interface AutoBackupResult {
  key: string;
  sizeBytes: number;
  deletedOldBackups: number;
  exportedAt: string;
  rowCounts: Record<string, number>;
}

const SENSITIVE_SETTING_KEYS = [
  "telegramBotToken",
  "notifyxApiKey",
  "webhookHeaders",
  "wechatWebhookUrl",
  "barkDeviceKey",
  "serverchanSendKey",
  "smtpPassword",
  "icalToken",
];

function stripSensitive(value: Record<string, unknown>): Record<string, unknown> {
  const out = { ...value };
  for (const key of SENSITIVE_SETTING_KEYS) {
    delete out[key];
  }
  return out;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function runAutoBackup(
  db: Database,
  store: BackupStore,
  options: AutoBackupOptions = {},
): Promise<AutoBackupResult> {
  const now = options.now ?? new Date();
  const prefix = options.prefix ?? "backups/auto/";
  const retentionDays = options.retentionDays ?? 30;

  const [
    allUsers,
    allSubs,
    allPayments,
    allBudgets,
    allTemplates,
    allSettings,
    allConfigs,
    allPriceHistory,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(subscriptions),
    db.select().from(subscriptionPayments),
    db.select().from(budgets),
    db.select().from(notificationTemplates),
    db.select().from(settingsTable),
    db.select().from(customConfigs),
    db.select().from(subscriptionPriceHistory),
  ]);

  const safeSettings = allSettings.map((row) => ({
    ...row,
    settings: stripSensitive((row.settings as Record<string, unknown>) ?? {}),
  }));

  const metadata = {
    app: "Qreminder",
    kind: "auto",
    schemaVersion: 2,
    exportedAt: now.toISOString(),
    rowCounts: {
      users: allUsers.length,
      subscriptions: allSubs.length,
      payments: allPayments.length,
      budgets: allBudgets.length,
      templates: allTemplates.length,
      settings: safeSettings.length,
      customConfigs: allConfigs.length,
      priceHistory: allPriceHistory.length,
    },
  };

  const files: Record<string, Uint8Array> = {
    "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
    "users.json": strToU8(JSON.stringify(allUsers, null, 2)),
    "subscriptions.json": strToU8(JSON.stringify(allSubs, null, 2)),
    "payments.json": strToU8(JSON.stringify(allPayments, null, 2)),
    "budgets.json": strToU8(JSON.stringify(allBudgets, null, 2)),
    "templates.json": strToU8(JSON.stringify(allTemplates, null, 2)),
    "settings.json": strToU8(JSON.stringify(safeSettings, null, 2)),
    "custom-configs.json": strToU8(JSON.stringify(allConfigs, null, 2)),
    "price-history.json": strToU8(JSON.stringify(allPriceHistory, null, 2)),
  };

  const zipped = zipSync(files, { level: 6 });
  const key = `${prefix}qreminder-${formatDate(now)}.zip`;
  await store.putBackup(key, zipped);

  // Rotate old backups: keep only those within retentionDays.
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffDateStr = formatDate(cutoff);
  const allKeys = await store.listBackupKeys(prefix);
  let deletedOldBackups = 0;
  for (const existingKey of allKeys) {
    // keys look like "<prefix>qreminder-YYYY-MM-DD.zip"
    const match = existingKey.match(/qreminder-(\d{4}-\d{2}-\d{2})\.zip$/);
    if (!match) continue;
    if (match[1]! < cutoffDateStr) {
      await store.deleteBackup(existingKey);
      deletedOldBackups += 1;
    }
  }

  return {
    key,
    sizeBytes: zipped.byteLength,
    deletedOldBackups,
    exportedAt: metadata.exportedAt,
    rowCounts: metadata.rowCounts,
  };
}
