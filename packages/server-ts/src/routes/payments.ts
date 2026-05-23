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
  const userId = c.get("user").id;
  const subId = c.req.query("subscriptionId");

  const conditions = [eq(subscriptionPayments.user, userId)];
  if (subId) conditions.push(eq(subscriptionPayments.subscriptionId, subId));

  const rows = await db
    .select()
    .from(subscriptionPayments)
    .where(and(...conditions))
    .orderBy(desc(subscriptionPayments.paidAt));

  return c.json({ payments: rows });
});

// POST /payments — create a payment record
paymentsRouter.post("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const body = await c.req.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, parsed.data.subscriptionId), eq(subscriptions.user, userId)));
  if (!sub) return c.json({ error: "subscription_not_found" }, 404);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(subscriptionPayments).values({
    id,
    user: userId,
    subscriptionId: parsed.data.subscriptionId,
    paidAt: parsed.data.paidAt,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    billingPeriod: sub.billingCycle,
    paymentMethod: parsed.data.paymentMethod ?? sub.paymentMethod ?? "",
    note: parsed.data.note ?? "",
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id }, 201);
});

// PATCH /payments/:id — update a payment record
paymentsRouter.patch("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const paymentId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [existing] = await db
    .select()
    .from(subscriptionPayments)
    .where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.user, userId)));
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

  return c.json({ ok: true });
});

// DELETE /payments/:id — delete a payment record
paymentsRouter.delete("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const paymentId = c.req.param("id");

  const [existing] = await db
    .select()
    .from(subscriptionPayments)
    .where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(subscriptionPayments).where(eq(subscriptionPayments.id, paymentId));
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

paymentsRouter.post("/renew/:subscriptionId", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const subId = c.req.param("subscriptionId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = renewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subId), eq(subscriptions.user, userId)));
  if (!sub) return c.json({ error: "subscription_not_found" }, 404);

  const now = new Date().toISOString();
  const paidAt = parsed.data.paidAt ?? now.slice(0, 10);
  const amount = parsed.data.amount ?? sub.price;
  const currency = parsed.data.currency ?? sub.currency;

  const paymentId = crypto.randomUUID();
  await db.insert(subscriptionPayments).values({
    id: paymentId,
    user: userId,
    subscriptionId: subId,
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

  return c.json({ paymentId, nextBillingDate }, 201);
});

// GET /payments/stats — spending statistics
paymentsRouter.get("/stats", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const allPayments = await db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.user, userId));

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(now.getFullYear());

  let monthlySpent = 0;
  let yearlySpent = 0;
  const byCategory = new Map<string, number>();

  for (const p of allPayments) {
    if (p.paidAt.startsWith(currentMonth)) monthlySpent += p.amount;
    if (p.paidAt.startsWith(currentYear)) yearlySpent += p.amount;
  }

  const subIds = [...new Set(allPayments.map((p) => p.subscriptionId))];
  if (subIds.length > 0) {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.user, userId));
    const subMap = new Map(subs.map((s) => [s.id, s]));
    for (const p of allPayments) {
      if (!p.paidAt.startsWith(currentYear)) continue;
      const sub = subMap.get(p.subscriptionId);
      const cat = sub?.category ?? "other";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + p.amount);
    }
  }

  return c.json({
    totalPayments: allPayments.length,
    monthlySpent,
    yearlySpent,
    byCategory: Object.fromEntries(byCategory),
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
