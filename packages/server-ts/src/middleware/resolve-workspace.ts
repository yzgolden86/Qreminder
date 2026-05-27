import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import { workspaces, workspaceMembers } from "../db/schema.js";
import type { AppEnv } from "../app.js";

export const WORKSPACE_HEADER = "x-workspace-id";

declare module "hono" {
  interface ContextVariableMap {
    workspaceId: string;
    workspaceRole: "owner" | "admin" | "editor" | "viewer";
  }
}

/**
 * Middleware that resolves the active workspace from the X-Workspace-Id header.
 * If no header is provided, falls back to the user's personal workspace.
 * Sets `c.var.workspaceId` and `c.var.workspaceRole` on success.
 */
export const resolveWorkspace = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get("deps").db;
  let user = c.get("user") as { id: string } | undefined;
  if (!user) {
    const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("session", session.session);
    c.set("user", session.user);
    user = session.user;
  }
  const userId = user.id;

  let wsId = c.req.header(WORKSPACE_HEADER) ?? "";

  if (!wsId) {
    const [personalWs] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.owner, userId), eq(workspaces.name, "Personal")))
      .limit(1);

    if (!personalWs) {
      const newId = `ws_personal_${userId}`;
      const now = new Date().toISOString();
      await db.insert(workspaces).values({
        id: newId,
        name: "Personal",
        owner: userId,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(workspaceMembers).values({
        id: `wsm_personal_${userId}`,
        workspaceId: newId,
        userId,
        role: "owner",
        createdAt: now,
      });
      wsId = newId;
    } else {
      wsId = personalWs.id;
    }
  }

  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    return c.json({ error: "workspace_access_denied" }, 403);
  }

  c.set("workspaceId", wsId);
  c.set("workspaceRole", membership.role);
  await next();
});
