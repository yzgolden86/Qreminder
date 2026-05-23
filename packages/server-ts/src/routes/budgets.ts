/**
 * 预算路由。
 *
 * CRUD for budgets + 预算使用率统计。
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { budgets, subscriptions, subscriptionPayments } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const budgetsRouter = new Hono<AppEnv>();

budgetsRouter.use("*", requireSession);

const createBudgetSchema = z.object({
  scopeType: z.enum(["global", "category", "tag", "payment_method"]),
  scopeId: z.string().max(200).optional(),
  period: z.enum(["monthly", "yearly"]),
  amount: z.number().finite().positive(),
  currency: z.string().min(1).max(10),
  enabled: z.boolean().optional(),
});

const updateBudgetSchema = createBudgetSchema.partial();

// GET /budgets — list all budgets for user
budgetsRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const rows = await db.select().from(budgets).where(eq(budgets.user, userId));
  return c.json({ budgets: rows });
});

// POST /budgets — create budget
budgetsRouter.post("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const body = await c.req.json().catch(() => null);
  const parsed = createBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(budgets).values({
    id,
    user: userId,
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId ?? "",
    period: parsed.data.period,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    enabled: parsed.data.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id }, 201);
});

// PATCH /budgets/:id — update budget
budgetsRouter.patch("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const budgetId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (parsed.data.scopeType !== undefined) updates.scopeType = parsed.data.scopeType;
  if (parsed.data.scopeId !== undefined) updates.scopeId = parsed.data.scopeId;
  if (parsed.data.period !== undefined) updates.period = parsed.data.period;
  if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount;
  if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency;
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;

  await db.update(budgets).set(updates).where(eq(budgets.id, budgetId));
  return c.json({ ok: true });
});

// DELETE /budgets/:id — delete budget
budgetsRouter.delete("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const budgetId = c.req.param("id");

  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(budgets).where(eq(budgets.id, budgetId));
  return c.json({ ok: true });
});

// GET /budgets/usage — budget usage statistics
budgetsRouter.get("/usage", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const [userBudgets, allPayments, allSubs] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.user, userId)),
    db.select().from(subscriptionPayments).where(eq(subscriptionPayments.user, userId)),
    db.select().from(subscriptions).where(eq(subscriptions.user, userId)),
  ]);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(now.getFullYear());

  const subMap = new Map(allSubs.map((s) => [s.id, s]));

  const usage = userBudgets
    .filter((b) => b.enabled)
    .map((budget) => {
      const relevantPayments = allPayments.filter((p) => {
        const inPeriod = budget.period === "monthly"
          ? p.paidAt.startsWith(currentMonth)
          : p.paidAt.startsWith(currentYear);
        if (!inPeriod) return false;

        if (budget.scopeType === "global") return true;
        const sub = subMap.get(p.subscriptionId);
        if (!sub) return false;

        if (budget.scopeType === "category") return sub.category === budget.scopeId;
        if (budget.scopeType === "tag") return (sub.tags ?? []).includes(budget.scopeId ?? "");
        if (budget.scopeType === "payment_method") return sub.paymentMethod === budget.scopeId;
        return false;
      });

      const spent = relevantPayments.reduce((sum, p) => sum + p.amount, 0);
      const usagePercent = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;

      return {
        budgetId: budget.id,
        scopeType: budget.scopeType,
        scopeId: budget.scopeId,
        period: budget.period,
        budgetAmount: budget.amount,
        currency: budget.currency,
        spent,
        usagePercent,
        overBudget: spent > budget.amount,
      };
    });

  return c.json({ usage });
});
