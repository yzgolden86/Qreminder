import { join } from "node:path";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  users,
  subscriptions,
  settings,
  customConfigs,
  notificationJobs,
  assets,
  type Database as RenewletDb,
} from "@renewlet/server";

export interface ImportOptions {
  pbDataDir: string;
  target:
    | { kind: "sqlite"; databasePath: string; assetsDir: string }
    | { kind: "d1"; databaseName: string; r2Bucket: string };
  dryRun: boolean;
}

interface TableStats {
  read: number;
  written: number;
  skipped: number;
}

export interface ImportReport {
  users: TableStats;
  subscriptions: TableStats;
  settings: TableStats;
  customConfigs: TableStats;
  notificationJobs: TableStats;
  assets: TableStats;
  errors: Array<{ table: string; recordId: string; reason: string }>;
}

function newStats(): TableStats {
  return { read: 0, written: 0, skipped: 0 };
}

function newReport(): ImportReport {
  return {
    users: newStats(),
    subscriptions: newStats(),
    settings: newStats(),
    customConfigs: newStats(),
    notificationJobs: newStats(),
    assets: newStats(),
    errors: [],
  };
}

interface PbUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  banned: number | null;
  verified: number | null;
  password: string | null;
  created: string;
  updated: string;
}

interface PbSubscriptionRow {
  id: string;
  user: string;
  name: string;
  logo: string | null;
  price: number | null;
  currency: string | null;
  billingCycle: string | null;
  customDays: number | null;
  category: string | null;
  status: string | null;
  paymentMethod: string | null;
  startDate: string | null;
  nextBillingDate: string | null;
  autoCalculateNextBillingDate: number | null;
  trialEndDate: string | null;
  website: string | null;
  notes: string | null;
  tags: string | null;
  extra: string | null;
  reminderDays: number | null;
  reminderOffsets: string | null;
  created: string;
  updated: string;
}

interface PbAssetRow {
  id: string;
  user: string;
  kind: string;
  file: string;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string | null;
  created: string;
  updated: string;
}

function parseJsonArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeOffsets(raw: string | null, fallbackDays: number | null): number[] {
  const arr = parseJsonArray<number>(raw, []);
  const filtered = arr
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 3650);
  if (filtered.length > 0) {
    return Array.from(new Set(filtered)).sort((a, b) => b - a).slice(0, 16);
  }
  if (fallbackDays != null && fallbackDays >= 0 && fallbackDays <= 3650) {
    return [fallbackDays];
  }
  return [3];
}

async function findPbAssetFile(pbDataDir: string, recordId: string, fileName: string): Promise<string | null> {
  const collectionDirs = await readdir(join(pbDataDir, "storage")).catch(() => [] as string[]);
  for (const collection of collectionDirs) {
    const candidate = join(pbDataDir, "storage", collection, recordId, fileName);
    const ok = await stat(candidate).then(() => true).catch(() => false);
    if (ok) return candidate;
  }
  return null;
}

async function importToSqlite(
  options: Extract<ImportOptions["target"], { kind: "sqlite" }>,
  pbDataDir: string,
  dryRun: boolean,
  report: ImportReport,
): Promise<void> {
  const pbDb = new BetterSqlite3(join(pbDataDir, "data.db"), { readonly: true });
  pbDb.pragma("query_only = ON");

  const targetDb = new BetterSqlite3(options.databasePath);
  targetDb.pragma("journal_mode = WAL");
  targetDb.pragma("foreign_keys = ON");
  const drizzleDb = drizzle(targetDb) as unknown as RenewletDb;

  await mkdir(options.assetsDir, { recursive: true });

  try {
    const userRows = pbDb.prepare("SELECT * FROM users").all() as PbUserRow[];
    report.users.read = userRows.length;
    for (const row of userRows) {
      const now = new Date(row.updated || row.created || Date.now());
      try {
        if (!dryRun) {
          await drizzleDb.insert(users).values({
            id: row.id,
            email: row.email,
            emailVerified: Boolean(row.verified),
            name: row.name ?? "",
            image: null,
            role: row.role === "admin" ? "admin" : "user",
            banned: Boolean(row.banned),
            createdAt: new Date(row.created),
            updatedAt: now,
          });
        }
        report.users.written++;
      } catch (err) {
        report.users.skipped++;
        report.errors.push({
          table: "users",
          recordId: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const subRows = pbDb.prepare("SELECT * FROM subscriptions").all() as PbSubscriptionRow[];
    report.subscriptions.read = subRows.length;
    for (const row of subRows) {
      const offsets = normalizeOffsets(row.reminderOffsets, row.reminderDays);
      try {
        if (!dryRun) {
          await drizzleDb.insert(subscriptions).values({
            id: row.id,
            user: row.user,
            name: row.name,
            logo: row.logo ?? "",
            price: row.price ?? 0,
            currency: row.currency ?? "CNY",
            billingCycle: (row.billingCycle ?? "monthly") as "monthly",
            customDays: row.customDays ?? null,
            category: row.category ?? "",
            status: (row.status ?? "active") as "active",
            paymentMethod: row.paymentMethod ?? "",
            startDate: row.startDate ?? "",
            nextBillingDate: row.nextBillingDate ?? "",
            autoCalculateNextBillingDate: Boolean(row.autoCalculateNextBillingDate ?? 1),
            trialEndDate: row.trialEndDate ?? null,
            website: row.website ?? null,
            notes: row.notes ?? "",
            tags: parseJsonArray<string>(row.tags, []),
            extra: parseJsonObject(row.extra),
            reminderDays: offsets[0] ?? 3,
            reminderOffsets: offsets,
            createdAt: row.created,
            updatedAt: row.updated,
          });
        }
        report.subscriptions.written++;
      } catch (err) {
        report.subscriptions.skipped++;
        report.errors.push({
          table: "subscriptions",
          recordId: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const settingsRows = pbDb.prepare("SELECT * FROM settings").all() as Array<{
      id: string;
      user: string;
      settings: string | null;
      created: string;
      updated: string;
    }>;
    report.settings.read = settingsRows.length;
    for (const row of settingsRows) {
      try {
        if (!dryRun) {
          await drizzleDb.insert(settings).values({
            id: row.id,
            user: row.user,
            settings: parseJsonObject(row.settings),
            createdAt: row.created,
            updatedAt: row.updated,
          });
        }
        report.settings.written++;
      } catch (err) {
        report.settings.skipped++;
        report.errors.push({
          table: "settings",
          recordId: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ccRows = pbDb.prepare("SELECT * FROM custom_configs").all() as Array<{
      id: string;
      user: string;
      config: string | null;
      created: string;
      updated: string;
    }>;
    report.customConfigs.read = ccRows.length;
    for (const row of ccRows) {
      try {
        if (!dryRun) {
          await drizzleDb.insert(customConfigs).values({
            id: row.id,
            user: row.user,
            config: parseJsonObject(row.config),
            createdAt: row.created,
            updatedAt: row.updated,
          });
        }
        report.customConfigs.written++;
      } catch (err) {
        report.customConfigs.skipped++;
        report.errors.push({
          table: "custom_configs",
          recordId: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const njRows = pbDb.prepare("SELECT * FROM notification_jobs").all() as Array<{
      id: string;
      user: string;
      scheduledLocalDate: string;
      scheduledLocalTime: string;
      timeZone: string;
      scheduledInstantUtc: string;
      status: string;
      attempts: number | null;
      lastError: string | null;
      result: string | null;
      created: string;
      updated: string;
    }>;
    report.notificationJobs.read = njRows.length;
    for (const row of njRows) {
      try {
        if (!dryRun) {
          await drizzleDb.insert(notificationJobs).values({
            id: row.id,
            user: row.user,
            scheduledLocalDate: row.scheduledLocalDate,
            scheduledLocalTime: row.scheduledLocalTime,
            timeZone: row.timeZone,
            scheduledInstantUtc: row.scheduledInstantUtc,
            status: (row.status ?? "pending") as "pending",
            attempts: row.attempts ?? 0,
            lastError: row.lastError ?? "",
            result: parseJsonObject(row.result),
            createdAt: row.created,
            updatedAt: row.updated,
          });
        }
        report.notificationJobs.written++;
      } catch (err) {
        report.notificationJobs.skipped++;
        report.errors.push({
          table: "notification_jobs",
          recordId: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const assetRows = pbDb.prepare("SELECT * FROM assets").all() as PbAssetRow[];
    report.assets.read = assetRows.length;
    for (const row of assetRows) {
      try {
        const sourcePath = await findPbAssetFile(pbDataDir, row.id, row.file);
        if (!sourcePath) {
          report.assets.skipped++;
          report.errors.push({
            table: "assets",
            recordId: row.id,
            reason: "file_not_found_on_disk",
          });
          continue;
        }
        const newKey = `${randomUUID()}-${row.file}`;
        if (!dryRun) {
          await copyFile(sourcePath, join(options.assetsDir, newKey));
          await drizzleDb.insert(assets).values({
            id: row.id,
            user: row.user,
            kind: (row.kind ?? "logo") as "logo" | "icon",
            file: newKey,
            mimeType: row.mimeType ?? "",
            sizeBytes: row.sizeBytes ?? 0,
            originalName: row.originalName ?? row.file,
            createdAt: row.created,
            updatedAt: row.updated,
          });
        }
        report.assets.written++;
      } catch (err) {
        report.assets.skipped++;
        report.errors.push({
          table: "assets",
          recordId: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    pbDb.close();
    targetDb.close();
  }
}

export async function runImport(options: ImportOptions): Promise<ImportReport> {
  const report = newReport();

  if (options.target.kind === "sqlite") {
    await importToSqlite(options.target, options.pbDataDir, options.dryRun, report);
    return report;
  }

  throw new Error(
    "d1 target not implemented; export to sqlite first, then run `wrangler d1 execute ... --file=` and `wrangler r2 object put`",
  );
}
