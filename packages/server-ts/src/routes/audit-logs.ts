/**
 * 审计日志路由。
 *
 * GET /api/audit-logs — 查询审计日志（管理员或空间成员）
 * 写入由其他路由调用 writeAuditLog() 完成。
 */
import { Hono } from "hono";
import { eq, desc, and, sql } from "drizzle-orm";
import { auditLogs } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";
import type { Database } from "../db/types.js";

export const auditLogsRouter = new Hono<AppEnv>();

auditLogsRouter.use("*", requireSession);

auditLogsRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const user = c.get("user") as { id: string; role: string };

  if (user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs);

  return c.json({
    logs: rows,
    total: total[0]?.count ?? 0,
    limit,
    offset,
  });
});

export async function writeAuditLog(
  db: Database,
  entry: {
    userId: string;
    workspaceId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    userId: entry.userId,
    workspaceId: entry.workspaceId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    summary: entry.summary ?? "",
    metadata: entry.metadata ?? {},
    createdAt: new Date().toISOString(),
  });
}
