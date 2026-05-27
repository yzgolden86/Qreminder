/**
 * JSON 导入路由。
 *
 * POST /api/import/json/preview — 校验并预览导入内容
 * POST /api/import/json/confirm — 执行导入
 */
import { Hono } from "hono";
import { zipSync, strToU8 } from "fflate";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import { writeAuditLog } from "./audit-logs.js";
import {
  BackupArchiveError,
  restoreWorkspaceBackupArchive,
  totalRestoredCount,
} from "../lib/backup-archive.js";
import type { AppEnv } from "../app.js";

export const importRouter = new Hono<AppEnv>();

importRouter.use("*", requireSession);

interface QreminderExport {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  data: {
    subscriptions?: ImportSubscription[];
    payments?: Array<Record<string, unknown>>;
    settings?: Record<string, unknown>;
    customConfig?: Record<string, unknown>;
    budgets?: Array<Record<string, unknown>>;
    templates?: Array<Record<string, unknown>>;
    notificationChannels?: Array<Record<string, unknown>>;
    priceHistory?: Array<Record<string, unknown>>;
  };
}

interface ImportSubscription {
  id?: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  customDays?: number | null;
  category?: string;
  status?: string;
  paymentMethod?: string;
  startDate: string;
  nextBillingDate: string;
  autoCalculateNextBillingDate?: boolean;
  trialEndDate?: string | null;
  website?: string | null;
  notes?: string | null;
  tags?: string[];
  reminderOffsets?: number[];
  logo?: string | null;
}

function validateExport(data: unknown): { ok: true; parsed: QreminderExport } | { ok: false; reason: string } {
  if (!isRecord(data)) return { ok: false, reason: "Invalid JSON" };
  const obj = data;
  if (obj["app"] !== "Qreminder") return { ok: false, reason: "Not a Qreminder export file" };
  if (typeof obj["schemaVersion"] !== "number" || !Number.isFinite(obj["schemaVersion"])) {
    return { ok: false, reason: "Missing schemaVersion" };
  }
  if (obj["schemaVersion"] > 2) return { ok: false, reason: `Unsupported schema version: ${obj["schemaVersion"]}` };
  if (!isRecord(obj["data"])) return { ok: false, reason: "Missing data field" };

  const dataObj = obj["data"];
  const arrayFields = [
    "subscriptions",
    "payments",
    "budgets",
    "templates",
    "notificationChannels",
    "priceHistory",
  ] as const;
  for (const field of arrayFields) {
    const value = dataObj[field];
    if (value == null) continue;
    if (!Array.isArray(value)) return { ok: false, reason: `${field} must be an array` };
    for (const item of value) {
      if (!isRecord(item)) return { ok: false, reason: `${field} must contain objects` };
    }
  }

  for (const field of ["settings", "customConfig"] as const) {
    const value = dataObj[field];
    if (value != null && !isRecord(value)) return { ok: false, reason: `${field} must be an object` };
  }

  const importSubs = dataObj["subscriptions"];
  if (Array.isArray(importSubs)) {
    for (const sub of importSubs) {
      if (typeof sub["name"] !== "string" || !sub["name"].trim()) {
        return { ok: false, reason: "subscriptions must include a non-empty name" };
      }
    }
  }
  return { ok: true, parsed: obj as unknown as QreminderExport };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

importRouter.post("/json/preview", async (c) => {
  const body = await c.req.json().catch(() => null);
  const validation = validateExport(body);
  if (!validation.ok) {
    return c.json({ error: "invalid_file", message: validation.reason }, 400);
  }

  const { parsed } = validation;
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");

  const existingSubs = await db
    .select({ id: subscriptions.id, name: subscriptions.name })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));

  const existingNames = new Set(existingSubs.map((s) => s.name.toLowerCase()));
  const importSubs = parsed.data.subscriptions ?? [];

  let newCount = 0;
  let duplicateCount = 0;
  const items: Array<{ name: string; status: "new" | "duplicate" }> = [];

  for (const sub of importSubs) {
    if (existingNames.has(sub.name.toLowerCase())) {
      duplicateCount++;
      items.push({ name: sub.name, status: "duplicate" });
    } else {
      newCount++;
      items.push({ name: sub.name, status: "new" });
    }
  }

  return c.json({
    valid: true,
    schemaVersion: parsed.schemaVersion,
    exportedAt: parsed.exportedAt,
    summary: {
      subscriptions: importSubs.length,
      new: newCount,
      duplicate: duplicateCount,
      payments: parsed.data.payments?.length ?? 0,
      budgets: parsed.data.budgets?.length ?? 0,
      templates: parsed.data.templates?.length ?? 0,
      notificationChannels: parsed.data.notificationChannels?.length ?? 0,
      priceHistory: parsed.data.priceHistory?.length ?? 0,
    },
    items,
  });
});

importRouter.post("/json/confirm", requireActiveWorkspaceRole("editor"), async (c) => {
  const body = await c.req.json().catch(() => null);
  const validation = validateExport(body);
  if (!validation.ok) {
    return c.json({ error: "invalid_file", message: validation.reason }, 400);
  }

  const { parsed } = validation;
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  let imported;
  try {
    imported = await restoreWorkspaceBackupArchive(db, userId, workspaceId, jsonExportToArchive(parsed));
  } catch (err) {
    if (err instanceof BackupArchiveError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
    throw err;
  }

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "import.json.confirm",
    targetType: "import",
    summary: `Imported ${totalRestoredCount(imported)} item(s) from JSON`,
    metadata: {
      ...imported,
      total: parsed.data.subscriptions?.length ?? 0,
      schemaVersion: parsed.schemaVersion,
    },
  });

  return c.json({ imported: totalRestoredCount(imported), details: imported });
});

function jsonExportToArchive(parsed: QreminderExport): Uint8Array {
  const metadata = {
    app: "Qreminder",
    version: "json-import",
    schemaVersion: parsed.schemaVersion,
    exportedAt: parsed.exportedAt,
    source: "json-import",
  };

  return zipSync({
    "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
    "subscriptions.json": strToU8(JSON.stringify(parsed.data.subscriptions ?? [], null, 2)),
    "payments.json": strToU8(JSON.stringify(parsed.data.payments ?? [], null, 2)),
    "settings.json": strToU8(JSON.stringify(parsed.data.settings ?? {}, null, 2)),
    "custom-config.json": strToU8(JSON.stringify(parsed.data.customConfig ?? {}, null, 2)),
    "budgets.json": strToU8(JSON.stringify(parsed.data.budgets ?? [], null, 2)),
    "templates.json": strToU8(JSON.stringify(parsed.data.templates ?? [], null, 2)),
    "notification-channels.json": strToU8(JSON.stringify(parsed.data.notificationChannels ?? [], null, 2)),
    "price-history.json": strToU8(JSON.stringify(parsed.data.priceHistory ?? [], null, 2)),
  }, { level: 6 });
}

export const __testing__ = {
  validateExport,
};
