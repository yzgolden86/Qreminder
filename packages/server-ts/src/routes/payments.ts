/**
 * 支付历史路由。
 *
 * CRUD for subscription_payments + 快速续费 (renew) 端点。
 * POST /api/subscriptions/:id/renew — 创建支付记录并推算下次续费日期。
 */
import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { subscriptionPayments, subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { writeAuditLog } from "./audit-logs.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import type { AppEnv } from "../app.js";

export const paymentsRouter = new Hono<AppEnv>();

paymentsRouter.use("*", requireSession);

const createPaymentSchema = z.object({
  subscriptionId: z.string().min(1),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite().nonnegative(),
  currency: z.string().min(1).max(10),
  paymentMethod: z.string().max(100).optional(),
  note: z.string().max(2000).optional(),
});

const updatePaymentSchema = z.object({
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().finite().nonnegative().optional(),
  currency: z.string().min(1).max(10).optional(),
  paymentMethod: z.string().max(100).optional(),
  note: z.string().max(2000).optional(),
});

// GET /payments?subscriptionId=xxx — list payments for a subscription
paymentsRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  const subId = c.req.query("subscriptionId");

  const conditions = [eq(subscriptionPayments.workspaceId, workspaceId)];
  if (subId) conditions.push(eq(subscriptionPayments.subscriptionId, subId));

  const rows = await db
    .select()
    .from(subscriptionPayments)
    .where(and(...conditions))
    .orderBy(desc(subscriptionPayments.paidAt));

  return c.json({ payments: rows });
});

// POST /payments — create a payment record
paymentsRouter.post("/", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, parsed.data.subscriptionId), eq(subscriptions.workspaceId, workspaceId)));
  if (!sub) return c.json({ error: "subscription_not_found" }, 404);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(subscriptionPayments).values({
    id,
    user: userId,
    workspaceId,
    subscriptionId: parsed.data.subscriptionId,
    subscriptionName: sub.name,
    paidAt: parsed.data.paidAt,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    billingPeriod: sub.billingCycle,
    paymentMethod: parsed.data.paymentMethod ?? sub.paymentMethod ?? "",
    note: parsed.data.note ?? "",
    createdAt: now,
    updatedAt: now,
  });

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "payment.create",
    targetType: "payment",
    targetId: id,
    summary: `Payment for "${sub.name}" (${parsed.data.amount} ${parsed.data.currency})`,
    metadata: { subscriptionId: parsed.data.subscriptionId },
  });

  return c.json({ id }, 201);
});

// PATCH /payments/:id — update a payment record
paymentsRouter.patch("/:id", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const paymentId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [existing] = await db
    .select()
    .from(subscriptionPayments)
    .where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.workspaceId, workspaceId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (parsed.data.paidAt !== undefined) updates.paidAt = parsed.data.paidAt;
  if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount;
  if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency;
  if (parsed.data.paymentMethod !== undefined) updates.paymentMethod = parsed.data.paymentMethod;
  if (parsed.data.note !== undefined) updates.note = parsed.data.note;

  await db
    .update(subscriptionPayments)
    .set(updates)
    .where(eq(subscriptionPayments.id, paymentId));

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "payment.update",
    targetType: "payment",
    targetId: paymentId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return c.json({ ok: true });
});

// DELETE /payments/:id — delete a payment record
paymentsRouter.delete("/:id", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const paymentId = c.req.param("id");

  const [existing] = await db
    .select()
    .from(subscriptionPayments)
    .where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.workspaceId, workspaceId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(subscriptionPayments).where(eq(subscriptionPayments.id, paymentId));
  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "payment.delete",
    targetType: "payment",
    targetId: paymentId,
    metadata: { subscriptionId: existing.subscriptionId },
  });
  return c.json({ ok: true });
});

// POST /subscriptions/:id/renew — quick renew
const renewSchema = z.object({
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().finite().nonnegative().optional(),
  currency: z.string().min(1).max(10).optional(),
  paymentMethod: z.string().max(100).optional(),
  note: z.string().max(2000).optional(),
});

paymentsRouter.post("/renew/:subscriptionId", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const subId = c.req.param("subscriptionId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = renewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subId), eq(subscriptions.workspaceId, workspaceId)));
  if (!sub) return c.json({ error: "subscription_not_found" }, 404);

  const now = new Date().toISOString();
  const paidAt = parsed.data.paidAt ?? now.slice(0, 10);
  const amount = parsed.data.amount ?? sub.price;
  const currency = parsed.data.currency ?? sub.currency;

  const paymentId = crypto.randomUUID();
  await db.insert(subscriptionPayments).values({
    id: paymentId,
    user: userId,
    workspaceId,
    subscriptionId: subId,
    subscriptionName: sub.name,
    paidAt,
    amount,
    currency,
    billingPeriod: sub.billingCycle,
    paymentMethod: parsed.data.paymentMethod ?? sub.paymentMethod ?? "",
    note: parsed.data.note ?? "",
    createdAt: now,
    updatedAt: now,
  });

  const nextBillingDate = calculateNextBillingDate(paidAt, sub.billingCycle, sub.customDays);
  await db
    .update(subscriptions)
    .set({ nextBillingDate, updatedAt: now })
    .where(eq(subscriptions.id, subId));

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "payment.renew",
    targetType: "payment",
    targetId: paymentId,
    summary: `Renewed "${sub.name}" through ${nextBillingDate}`,
    metadata: {
      subscriptionId: subId,
      nextBillingDate,
      amount,
      currency,
    },
  });

  return c.json({ paymentId, nextBillingDate }, 201);
});

// GET /payments/stats?month=YYYY-MM — spending statistics
// Why: bare iteration over paidAt strings is timezone-independent (paidAt is stored
// as user-local YYYY-MM-DD). We expose monthlyCount/yearlyCount + per-currency
// breakdowns so the UI can show how many payments contribute to the sum and so
// mixed-currency portfolios aren't summed into a misleading single number.
paymentsRouter.get("/stats", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");

  const allPayments = await db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.workspaceId, workspaceId));

  // Allow the client to override the "current month" so the widget matches the
  // user's local clock even when the server runs in a different timezone.
  const requestedMonth = c.req.query("month");
  const fallback = new Date();
  const currentMonth = /^\d{4}-\d{2}$/.test(requestedMonth ?? "")
    ? requestedMonth!
    : `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = currentMonth.slice(0, 4);

  let monthlySpent = 0;
  let yearlySpent = 0;
  let monthlyCount = 0;
  let yearlyCount = 0;
  const monthlyByCurrency = new Map<string, number>();
  const yearlyByCurrency = new Map<string, number>();
  const byCategory = new Map<string, number>();

  for (const p of allPayments) {
    // paidAt is normalized to YYYY-MM-DD on insert, but defensively slice to
    // tolerate legacy rows stored as ISO datetimes.
    const day = p.paidAt.slice(0, 10);
    if (day.startsWith(currentMonth)) {
      monthlySpent += p.amount;
      monthlyCount += 1;
      monthlyByCurrency.set(p.currency, (monthlyByCurrency.get(p.currency) ?? 0) + p.amount);
    }
    if (day.startsWith(currentYear)) {
      yearlySpent += p.amount;
      yearlyCount += 1;
      yearlyByCurrency.set(p.currency, (yearlyByCurrency.get(p.currency) ?? 0) + p.amount);
    }
  }

  const subIds = [...new Set(allPayments.map((p) => p.subscriptionId).filter((id): id is string => id !== null))];
  if (subIds.length > 0) {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
    const subMap = new Map(subs.map((s) => [s.id, s]));
    for (const p of allPayments) {
      if (!p.paidAt.slice(0, 10).startsWith(currentYear)) continue;
      // Orphaned payments (subscriptionId = null after subscription deletion)
      // fall into the "other" bucket so they still contribute to the year total.
      const sub = p.subscriptionId ? subMap.get(p.subscriptionId) : undefined;
      const cat = sub?.category ?? "other";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + p.amount);
    }
  }

  return c.json({
    totalPayments: allPayments.length,
    monthlySpent,
    yearlySpent,
    monthlyCount,
    yearlyCount,
    monthlyByCurrency: Object.fromEntries(monthlyByCurrency),
    yearlyByCurrency: Object.fromEntries(yearlyByCurrency),
    byCategory: Object.fromEntries(byCategory),
    currentMonth,
  });
});

function calculateNextBillingDate(
  fromDate: string,
  cycle: string,
  customDays: number | null,
): string {
  const [y, m, d] = fromDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);

  switch (cycle) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "semi-annual":
      date.setMonth(date.getMonth() + 6);
      break;
    case "annual":
      date.setFullYear(date.getFullYear() + 1);
      break;
    case "custom":
      date.setDate(date.getDate() + (customDays ?? 30));
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// POST /payments/sync-from-subscriptions
// Why: users add subscriptions in the management page expecting them to show up
// in payment history. Subscriptions are "plans" and payments are "events", so
// they don't auto-link — this endpoint lets users backfill the payment events
// implied by each subscription's startDate + billingCycle, skipping any
// (subscriptionId, paidAt) tuple already on record.
const syncSchema = z.object({
  scope: z.enum(["month", "year", "all"]).default("month"),
  subscriptionIds: z.array(z.string()).optional(),
  todayOverride: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

paymentsRouter.post("/sync-from-subscriptions", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  // Use the client-supplied "today" so the upper bound matches the user's
  // local clock rather than the server's UTC time.
  const today = parsed.data.todayOverride ?? new Date().toISOString().slice(0, 10);
  const scope = parsed.data.scope;

  let scopeStart: string;
  if (scope === "month") {
    scopeStart = `${today.slice(0, 7)}-01`;
  } else if (scope === "year") {
    scopeStart = `${today.slice(0, 4)}-01-01`;
  } else {
    scopeStart = "0000-01-01";
  }

  const baseConditions = [eq(subscriptions.workspaceId, workspaceId)];
  const allSubs = await db.select().from(subscriptions).where(and(...baseConditions));
  const filtered = allSubs.filter((s) => {
    if (s.status !== "active" && s.status !== "trial") return false;
    if (parsed.data.subscriptionIds && parsed.data.subscriptionIds.length > 0) {
      return parsed.data.subscriptionIds.includes(s.id);
    }
    return true;
  });

  // Pre-fetch all of this user's payments once and bucket by subscriptionId so
  // the dedup check is O(1) per candidate instead of N round-trips to D1.
  // Orphaned payments (subscriptionId = null) can never collide with a sync
  // insert (which always has a real subscriptionId), so we skip them in the key.
  const existingPayments = await db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.workspaceId, workspaceId));
  const existingByKey = new Set(
    existingPayments
      .filter((p): p is typeof p & { subscriptionId: string } => p.subscriptionId !== null)
      .map((p) => `${p.subscriptionId}|${p.paidAt.slice(0, 10)}`),
  );

  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const insertedSummary: Array<{ subscriptionId: string; paidAt: string }> = [];

  for (const sub of filtered) {
    // Walk forward from startDate by billingCycle, collecting every implied
    // payment date that falls inside [scopeStart, today]. Cap the loop so a
    // misconfigured subscription (startDate in 1900) can't OOM us.
    let cursor = sub.startDate;
    const guard = 5000;
    let steps = 0;
    while (cursor <= today && steps < guard) {
      steps += 1;
      if (cursor >= scopeStart) {
        const key = `${sub.id}|${cursor}`;
        if (existingByKey.has(key)) {
          skipped += 1;
        } else {
          const id = crypto.randomUUID();
          await db.insert(subscriptionPayments).values({
            id,
            user: userId,
            workspaceId,
            subscriptionId: sub.id,
            subscriptionName: sub.name,
            paidAt: cursor,
            amount: sub.price,
            currency: sub.currency,
            billingPeriod: sub.billingCycle,
            paymentMethod: sub.paymentMethod ?? "",
            note: "auto-synced from subscription",
            createdAt: now,
            updatedAt: now,
          });
          existingByKey.add(key);
          inserted += 1;
          insertedSummary.push({ subscriptionId: sub.id, paidAt: cursor });
        }
      }
      const next = calculateNextBillingDate(cursor, sub.billingCycle, sub.customDays);
      if (next <= cursor) break; // safety: never advance backward / stall
      cursor = next;
    }
  }

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "payment.syncFromSubscriptions",
    targetType: "payment",
    summary: `Synced ${inserted} payment(s) from subscriptions`,
    metadata: {
      inserted,
      skipped,
      subscriptionsConsidered: filtered.length,
      scope,
      hasSubscriptionFilter: Boolean(parsed.data.subscriptionIds?.length),
    },
  });

  return c.json({
    inserted,
    skipped,
    subscriptionsConsidered: filtered.length,
    inserts: insertedSummary,
  });
});
