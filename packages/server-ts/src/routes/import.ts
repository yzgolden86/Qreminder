/**
 * JSON 导入路由。
 *
 * POST /api/import/json/preview — 校验并预览导入内容
 * POST /api/import/json/confirm — 执行导入
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import { writeAuditLog } from "./audit-logs.js";
import type { AppEnv } from "../app.js";

export const importRouter = new Hono<AppEnv>();

importRouter.use("*", requireSession);

interface QreminderExport {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  data: {
    subscriptions?: ImportSubscription[];
    settings?: Record<string, unknown>;
    customConfig?: Record<string, unknown>;
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
  if (!data || typeof data !== "object") return { ok: false, reason: "Invalid JSON" };
  const obj = data as Record<string, unknown>;
  if (obj["app"] !== "Qreminder") return { ok: false, reason: "Not a Qreminder export file" };
  if (typeof obj["schemaVersion"] !== "number") return { ok: false, reason: "Missing schemaVersion" };
  if (obj["schemaVersion"] > 1) return { ok: false, reason: `Unsupported schema version: ${obj["schemaVersion"]}` };
  if (!obj["data"] || typeof obj["data"] !== "object") return { ok: false, reason: "Missing data field" };
  return { ok: true, parsed: obj as unknown as QreminderExport };
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
  const now = new Date().toISOString();

  const existingSubs = await db
    .select({ name: subscriptions.name })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  const existingNames = new Set(existingSubs.map((s) => s.name.toLowerCase()));

  const importSubs = (parsed.data.subscriptions ?? []).filter(
    (sub) => !existingNames.has(sub.name.toLowerCase()),
  );

  let imported = 0;
  for (const sub of importSubs) {
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      name: sub.name,
      logo: sub.logo ?? "",
      price: sub.price ?? 0,
      currency: sub.currency ?? "CNY",
      billingCycle: normalizeCycle(sub.billingCycle),
      customDays: sub.customDays ?? null,
      category: sub.category ?? "",
      status: normalizeStatus(sub.status),
      paymentMethod: sub.paymentMethod ?? "",
      startDate: sub.startDate,
      nextBillingDate: sub.nextBillingDate,
      autoCalculateNextBillingDate: sub.autoCalculateNextBillingDate ?? true,
      trialEndDate: sub.trialEndDate ?? null,
      website: sub.website ?? null,
      notes: sub.notes ?? "",
      tags: sub.tags ?? [],
      reminderOffsets: sub.reminderOffsets ?? [3],
      extra: {},
      reminderDays: 3,
      createdAt: now,
      updatedAt: now,
    });
    imported++;
  }

  const skipped = (parsed.data.subscriptions ?? []).length - imported;
  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "import.json.confirm",
    targetType: "import",
    summary: `Imported ${imported} subscription(s) from JSON`,
    metadata: {
      imported,
      skipped,
      total: parsed.data.subscriptions?.length ?? 0,
      schemaVersion: parsed.schemaVersion,
    },
  });

  return c.json({ imported, skipped });
});

function normalizeCycle(value: string | undefined): "weekly" | "monthly" | "quarterly" | "semi-annual" | "annual" | "custom" {
  const valid = ["weekly", "monthly", "quarterly", "semi-annual", "annual", "custom"] as const;
  if (value && (valid as readonly string[]).includes(value)) return value as typeof valid[number];
  return "monthly";
}

function normalizeStatus(value: string | undefined): "trial" | "active" | "paused" | "cancelled" {
  const valid = ["trial", "active", "paused", "cancelled"] as const;
  if (value && (valid as readonly string[]).includes(value)) return value as typeof valid[number];
  return "active";
}
