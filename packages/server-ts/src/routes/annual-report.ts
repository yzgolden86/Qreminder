/**
 * GET /api/payments/annual-report?year=YYYY
 *
 * 聚合用户某一年的所有 payment + active 订阅，返回年报数据：
 * - 总花费（按币种）
 * - 总笔数
 * - 月份分布
 * - 分类分布（按 subscription.category）
 * - Top N 最贵订阅
 * - 同比变化（vs 去年）
 *
 * 前端 /annual-report 页面读取后渲染成可分享的页面。
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { subscriptionPayments, subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const annualReportRouter = new Hono<AppEnv>();

annualReportRouter.use("*", requireSession);

annualReportRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");

  const yearParam = c.req.query("year");
  const yearStr = /^\d{4}$/.test(yearParam ?? "")
    ? yearParam!
    : String(new Date().getFullYear());
  const year = Number(yearStr);
  const prevYearStr = String(year - 1);

  const allPayments = await db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.workspaceId, workspaceId));

  const userSubs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  const subMap = new Map(userSubs.map((s) => [s.id, s]));

  const thisYearPayments = allPayments.filter((p) => p.paidAt.slice(0, 4) === yearStr);
  const prevYearPayments = allPayments.filter((p) => p.paidAt.slice(0, 4) === prevYearStr);

  const totalByCurrency = new Map<string, number>();
  const monthlyTotals = new Array<number>(12).fill(0);
  const categoryTotals = new Map<string, number>();
  const subscriptionTotals = new Map<string, { name: string; amount: number; currency: string }>();

  for (const p of thisYearPayments) {
    totalByCurrency.set(p.currency, (totalByCurrency.get(p.currency) ?? 0) + p.amount);

    const month = Number(p.paidAt.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) monthlyTotals[month] = (monthlyTotals[month] ?? 0) + p.amount;

    const sub = p.subscriptionId ? subMap.get(p.subscriptionId) : undefined;
    const cat = sub?.category ?? "other";
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + p.amount);

    const subKey = p.subscriptionId ?? "__orphan";
    const name = sub?.name ?? p.subscriptionName ?? "(deleted)";
    const existing = subscriptionTotals.get(subKey);
    if (existing) {
      existing.amount += p.amount;
    } else {
      subscriptionTotals.set(subKey, { name, amount: p.amount, currency: p.currency });
    }
  }

  const prevTotal = prevYearPayments.reduce((s, p) => s + p.amount, 0);
  const thisTotal = thisYearPayments.reduce((s, p) => s + p.amount, 0);
  const yoyChange = prevTotal === 0 ? null : ((thisTotal - prevTotal) / prevTotal) * 100;

  const topSubscriptions = Array.from(subscriptionTotals.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Months are 0..11; emit a friendly { month: "2026-01", total } shape that
  // doesn't require the client to remember zero-based indexing.
  const monthly = monthlyTotals.map((total, idx) => ({
    month: `${yearStr}-${String(idx + 1).padStart(2, "0")}`,
    total,
  }));

  return c.json({
    year,
    paymentCount: thisYearPayments.length,
    totalSpent: thisTotal,
    totalByCurrency: Object.fromEntries(totalByCurrency),
    monthly,
    byCategory: Object.fromEntries(categoryTotals),
    topSubscriptions,
    yoy: {
      previousYearTotal: prevTotal,
      changePercent: yoyChange,
    },
    activeSubscriptionsAtYearEnd: userSubs.filter((s) => s.status === "active" || s.status === "trial").length,
  });
});
