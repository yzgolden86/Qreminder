/**
 * 工作空间权限助手。
 *
 * 角色层级（高 → 低）：
 *   owner > admin > editor > viewer
 *
 * 设计原则：
 * - 通过 `roleAtLeast(role, required)` 做唯一来源的"权限是否满足"判断，避免散落各处的 if-else 漏判。
 * - 单独导出 `requireWorkspaceRole(level)` 中间件工厂，让路由声明性地表达"至少需要 admin"。
 *
 * 范围限制：本模块只关心工作空间内的成员资格与角色。
 * 全站 admin（users.role === "admin"）仍由 [[require-session]] + 路由自行判断。
 */
import type { MiddlewareHandler } from "hono";
import { eq, and } from "drizzle-orm";
import { workspaceMembers } from "../db/schema.js";
import type { Database } from "../db/types.js";
import type { AppEnv } from "../app.js";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 40,
  admin: 30,
  editor: 20,
  viewer: 10,
};

export function roleAtLeast(actual: WorkspaceRole, required: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** Read-only membership lookup. Returns null when the user is not a member. */
export async function getMembership(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<{ id: string; role: WorkspaceRole } | null> {
  const [row] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    );
  if (!row) return null;
  return { id: row.id, role: row.role };
}

/**
 * Middleware factory: enforce the caller has at least `requiredRole` in the workspace
 * named by the route parameter `paramName` (default: "id").
 *
 * Sets `c.set("workspaceRole", role)` on success so handlers can branch further.
 */
export function requireWorkspaceRole(
  requiredRole: WorkspaceRole,
  paramName = "id",
): MiddlewareHandler<AppEnv & { Variables: { workspaceRole: WorkspaceRole } }> {
  return async (c, next) => {
    const db = c.get("deps").db;
    const userId = c.get("user").id;
    const wsId = c.req.param(paramName);
    if (!wsId) {
      return c.json({ error: "missing_workspace_id" }, 400);
    }
    const membership = await getMembership(db, wsId, userId);
    if (!membership) {
      return c.json({ error: "forbidden", reason: "not_a_member" }, 403);
    }
    if (!roleAtLeast(membership.role, requiredRole)) {
      return c.json({ error: "forbidden", reason: "insufficient_role", required: requiredRole, have: membership.role }, 403);
    }
    c.set("workspaceRole", membership.role);
    await next();
  };
}

export const __testing__ = {
  ROLE_RANK,
};
