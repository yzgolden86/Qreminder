/**
 * 系统诊断路由（仅管理员可访问）。
 *
 * GET /api/app/admin/diagnostics — 系统状态概览
 */
import { Hono } from "hono";
import { desc, sql } from "drizzle-orm";
import {
  users,
  subscriptions,
  subscriptionPayments,
  budgets,
  notificationJobs,
  settings,
} from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const diagnosticsRouter = new Hono<AppEnv>();

diagnosticsRouter.use("*", requireSession);

diagnosticsRouter.get("/", async (c) => {
  const user = c.get("user") as { id: string; role: string };
  if (user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.get("deps").db;
  const deps = c.get("deps");

  const [
    userCount,
    subCount,
    paymentCount,
    budgetCount,
    recentJobs,
    failedJobs,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(subscriptions),
    db.select({ count: sql<number>`count(*)` }).from(subscriptionPayments),
    db.select({ count: sql<number>`count(*)` }).from(budgets),
    db.select().from(notificationJobs).orderBy(desc(notificationJobs.updatedAt)).limit(5),
    db.select().from(notificationJobs)
      .where(sql`${notificationJobs.status} = 'failed'`)
      .orderBy(desc(notificationJobs.updatedAt))
      .limit(10),
  ]);

  const lastCronRun = recentJobs[0]?.updatedAt ?? null;
  const lastCronStatus = recentJobs[0]?.status ?? null;

  return c.json({
    system: {
      version: "2.6.0",
      runtime: deps.scheduler.kind,
      database: deps.scheduler.kind === "node-cron" ? "SQLite" : "D1",
      storage: deps.scheduler.kind === "node-cron" ? "filesystem" : "R2",
    },
    stats: {
      users: userCount[0]?.count ?? 0,
      subscriptions: subCount[0]?.count ?? 0,
      payments: paymentCount[0]?.count ?? 0,
      budgets: budgetCount[0]?.count ?? 0,
    },
    cron: {
      lastRun: lastCronRun,
      lastStatus: lastCronStatus,
      recentJobs: recentJobs.map((j) => ({
        user: j.user,
        date: j.scheduledLocalDate,
        time: j.scheduledLocalTime,
        status: j.status,
        attempts: j.attempts,
        lastError: j.lastError,
        updatedAt: j.updatedAt,
      })),
    },
    recentFailures: failedJobs.map((j) => ({
      user: j.user,
      date: j.scheduledLocalDate,
      status: j.status,
      lastError: j.lastError,
      attempts: j.attempts,
      updatedAt: j.updatedAt,
    })),
  });
});
