/**
 * Wallos / SubTracker 等第三方导入路由。
 *
 * Wallos 是开源的自托管订阅追踪器（https://github.com/ellite/Wallos），SubTracker
 * 是另一个流行的订阅管理项目。两者的导出 JSON 字段不完全相同，但都包含
 * subscriptions 主表。本路由提供"宽容的"解析器，按字段优先级映射到 Qreminder
 * 的 subscriptionDraft，无法识别的字段会被忽略。
 *
 * 端点：
 * - POST /api/import/wallos — 接收 Wallos 导出 JSON，返回新增条目数
 * - POST /api/import/subtracker — 接收 SubTracker 导出 JSON，返回新增条目数
 *
 * 设计：dedupe 按订阅名（lowercase）去重，避免覆盖已有数据。
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import { writeAuditLog } from "./audit-logs.js";
import type { AppEnv } from "../app.js";

export const externalImportRouter = new Hono<AppEnv>();

externalImportRouter.use("*", requireSession);

type Cycle = "weekly" | "monthly" | "quarterly" | "semi-annual" | "annual" | "custom";
type Status = "trial" | "active" | "paused" | "cancelled";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

function asString(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v);
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asDate(v: unknown, fallback: string): string {
  const s = asString(v).trim();
  if (!s) return fallback;
  // Accept either YYYY-MM-DD or any parseable date; normalize to YYYY-MM-DD.
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Wallos uses (frequency, cycle) where cycle is one of days/weeks/months/years.
 * Map that into our enum + customDays for irregular intervals.
 */
function mapWallosFrequency(
  frequency: unknown,
  cycle: unknown,
): { billingCycle: Cycle; customDays: number | null } {
  const n = asNumber(frequency, 1);
  const c = asString(cycle).toLowerCase();

  if (c === "days" || c === "day") {
    if (n === 7) return { billingCycle: "weekly", customDays: null };
    if (n === 30) return { billingCycle: "monthly", customDays: null };
    if (n === 90) return { billingCycle: "quarterly", customDays: null };
    if (n === 180) return { billingCycle: "semi-annual", customDays: null };
    if (n === 365) return { billingCycle: "annual", customDays: null };
    return { billingCycle: "custom", customDays: n };
  }
  if (c === "weeks" || c === "week") {
    if (n === 1) return { billingCycle: "weekly", customDays: null };
    return { billingCycle: "custom", customDays: n * 7 };
  }
  if (c === "months" || c === "month") {
    if (n === 1) return { billingCycle: "monthly", customDays: null };
    if (n === 3) return { billingCycle: "quarterly", customDays: null };
    if (n === 6) return { billingCycle: "semi-annual", customDays: null };
    if (n === 12) return { billingCycle: "annual", customDays: null };
    return { billingCycle: "custom", customDays: n * 30 };
  }
  if (c === "years" || c === "year") {
    if (n === 1) return { billingCycle: "annual", customDays: null };
    return { billingCycle: "custom", customDays: n * 365 };
  }
  // Default: assume monthly if cycle is unknown.
  return { billingCycle: "monthly", customDays: null };
}

interface CategoryLookup {
  byId: Map<string, string>;
  byNumericId: Map<number, string>;
}

function buildCategoryLookup(raw: unknown): CategoryLookup {
  const byId = new Map<string, string>();
  const byNumericId = new Map<number, string>();
  if (!Array.isArray(raw)) return { byId, byNumericId };
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = asString(obj["name"] ?? obj["category_name"]).trim();
    if (!name) continue;
    const id = obj["id"];
    if (typeof id === "string") byId.set(id, name);
    if (typeof id === "number") byNumericId.set(id, name);
  }
  return { byId, byNumericId };
}

function lookupCategory(
  lookup: CategoryLookup,
  inlineName: unknown,
  idHint: unknown,
): string {
  const direct = asString(inlineName).trim();
  if (direct) return direct;
  if (typeof idHint === "string" && lookup.byId.has(idHint)) {
    return lookup.byId.get(idHint)!;
  }
  if (typeof idHint === "number" && lookup.byNumericId.has(idHint)) {
    return lookup.byNumericId.get(idHint)!;
  }
  return "";
}

/**
 * Best-effort mapping from a Wallos subscription row to our insert shape.
 */
function mapWallosSubscription(
  row: Record<string, unknown>,
  userId: string,
  lookups: { categories: CategoryLookup; paymentMethods: CategoryLookup },
  nowIso: string,
): typeof subscriptions.$inferInsert | null {
  const name = asString(row["name"]).trim();
  if (!name) return null;

  const { billingCycle, customDays } = mapWallosFrequency(row["frequency"], row["cycle"]);
  const startDate = asDate(row["start_date"], todayIso());
  const nextBillingDate = asDate(row["next_payment"], startDate);
  const status: Status = asNumber(row["inactive"], 0) === 1 ? "cancelled" : "active";

  return {
    id: crypto.randomUUID(),
    user: userId,
    name,
    logo: asString(row["logo"]),
    price: asNumber(row["price"], 0),
    currency: asString(row["currency_code"] ?? row["currency"], "CNY"),
    billingCycle,
    customDays,
    category: lookupCategory(lookups.categories, row["category_name"], row["category_id"]),
    status,
    paymentMethod: lookupCategory(
      lookups.paymentMethods,
      row["payment_method_name"],
      row["payment_method_id"],
    ),
    startDate,
    nextBillingDate,
    autoCalculateNextBillingDate: asNumber(row["auto_renew"], 1) === 1,
    trialEndDate: null,
    website: asString(row["url"]).trim() || null,
    notes: asString(row["notes"]),
    tags: [],
    extra: {},
    reminderDays: asNumber(row["notify_days_before"], 3),
    reminderOffsets: [asNumber(row["notify_days_before"], 3)],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * SubTracker (Smile-QWQ/SubTracker) export shape. Slightly different from Wallos:
 * fields use camelCase, billing cycle is a string enum like "MONTHLY".
 */
function mapSubTrackerSubscription(
  row: Record<string, unknown>,
  userId: string,
  nowIso: string,
): typeof subscriptions.$inferInsert | null {
  const name = asString(row["name"]).trim();
  if (!name) return null;

  // SubTracker cycle enum: DAILY, WEEKLY, MONTHLY, QUARTERLY, BIANNUALLY, YEARLY, CUSTOM
  const cycleRaw = asString(row["billingCycle"] ?? row["cycle"]).toUpperCase();
  let billingCycle: Cycle = "monthly";
  let customDays: number | null = null;
  switch (cycleRaw) {
    case "WEEKLY": billingCycle = "weekly"; break;
    case "MONTHLY": billingCycle = "monthly"; break;
    case "QUARTERLY": billingCycle = "quarterly"; break;
    case "BIANNUALLY":
    case "SEMI_ANNUAL":
    case "SEMI-ANNUAL": billingCycle = "semi-annual"; break;
    case "YEARLY":
    case "ANNUAL":
    case "ANNUALLY": billingCycle = "annual"; break;
    case "CUSTOM":
    case "DAILY":
      billingCycle = "custom";
      customDays = asNumber(row["customDays"] ?? row["cycleDays"] ?? row["interval"], 1);
      break;
  }

  const startDate = asDate(row["startDate"], todayIso());
  const nextBillingDate = asDate(row["nextBillingDate"] ?? row["nextPaymentDate"], startDate);
  const statusRaw = asString(row["status"]).toLowerCase();
  const status: Status =
    statusRaw === "trial"
      ? "trial"
      : statusRaw === "paused"
        ? "paused"
        : statusRaw === "cancelled" || statusRaw === "canceled" || statusRaw === "inactive"
          ? "cancelled"
          : "active";

  const tags = Array.isArray(row["tags"])
    ? (row["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
    : [];

  return {
    id: crypto.randomUUID(),
    user: userId,
    name,
    logo: asString(row["logo"] ?? row["icon"]),
    price: asNumber(row["price"] ?? row["amount"], 0),
    currency: asString(row["currency"], "CNY"),
    billingCycle,
    customDays,
    category: asString(row["category"]),
    status,
    paymentMethod: asString(row["paymentMethod"]),
    startDate,
    nextBillingDate,
    autoCalculateNextBillingDate: row["autoRenew"] !== false,
    trialEndDate: asString(row["trialEndDate"]) || null,
    website: asString(row["website"] ?? row["url"]) || null,
    notes: asString(row["notes"] ?? row["description"]),
    tags,
    extra: {},
    reminderDays: asNumber(row["reminderDays"], 3),
    reminderOffsets: Array.isArray(row["reminderOffsets"])
      ? (row["reminderOffsets"] as unknown[]).filter((n): n is number => typeof n === "number")
      : [asNumber(row["reminderDays"], 3)],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

externalImportRouter.post("/wallos", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_json" }, 400);
  }

  const subs = Array.isArray((body as Record<string, unknown>)["subscriptions"])
    ? ((body as Record<string, unknown>)["subscriptions"] as Array<Record<string, unknown>>)
    : [];
  if (subs.length === 0) {
    return c.json({ error: "no_subscriptions" }, 400);
  }

  const lookups = {
    categories: buildCategoryLookup((body as Record<string, unknown>)["categories"]),
    paymentMethods: buildCategoryLookup((body as Record<string, unknown>)["payment_methods"]),
  };

  const existing = await db
    .select({ name: subscriptions.name })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  const existingNames = new Set(existing.map((s) => s.name.trim().toLowerCase()));

  const now = new Date().toISOString();
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  for (const row of subs) {
    try {
      const mapped = mapWallosSubscription(row, userId, lookups, now);
      if (!mapped) {
        result.skipped += 1;
        continue;
      }
      if (existingNames.has(mapped.name.trim().toLowerCase())) {
        result.skipped += 1;
        continue;
      }
      await db.insert(subscriptions).values({ ...mapped, workspaceId });
      existingNames.add(mapped.name.trim().toLowerCase());
      result.imported += 1;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "import.wallos",
    targetType: "import",
    summary: `Imported ${result.imported} subscription(s) from Wallos`,
    metadata: {
      imported: result.imported,
      skipped: result.skipped,
      errorCount: result.errors.length,
      total: subs.length,
    },
  });

  return c.json(result);
});

externalImportRouter.post("/subtracker", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_json" }, 400);
  }

  // SubTracker exports as either an array directly or { subscriptions: [...] }.
  const root = body as Record<string, unknown>;
  const subs = Array.isArray(root["subscriptions"])
    ? (root["subscriptions"] as Array<Record<string, unknown>>)
    : Array.isArray(body)
      ? (body as Array<Record<string, unknown>>)
      : [];
  if (subs.length === 0) {
    return c.json({ error: "no_subscriptions" }, 400);
  }

  const existing = await db
    .select({ name: subscriptions.name })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  const existingNames = new Set(existing.map((s) => s.name.trim().toLowerCase()));

  const now = new Date().toISOString();
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  for (const row of subs) {
    try {
      const mapped = mapSubTrackerSubscription(row, userId, now);
      if (!mapped) {
        result.skipped += 1;
        continue;
      }
      if (existingNames.has(mapped.name.trim().toLowerCase())) {
        result.skipped += 1;
        continue;
      }
      await db.insert(subscriptions).values({ ...mapped, workspaceId });
      existingNames.add(mapped.name.trim().toLowerCase());
      result.imported += 1;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "import.subtracker",
    targetType: "import",
    summary: `Imported ${result.imported} subscription(s) from SubTracker`,
    metadata: {
      imported: result.imported,
      skipped: result.skipped,
      errorCount: result.errors.length,
      total: subs.length,
    },
  });

  return c.json(result);
});

// Exposed for unit tests — kept off the public surface by name.
export const __testing__ = {
  mapWallosSubscription,
  mapSubTrackerSubscription,
  buildCategoryLookup,
  mapWallosFrequency,
};
