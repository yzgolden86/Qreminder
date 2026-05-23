/**
 * 工作空间（家庭/团队）路由。
 *
 * CRUD for workspaces + member management.
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { workspaces, workspaceMembers, users } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const workspacesRouter = new Hono<AppEnv>();

workspacesRouter.use("*", requireSession);

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]),
});

const updateMemberSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});

// GET /workspaces — list workspaces user belongs to
workspacesRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const memberships = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));

  if (memberships.length === 0) {
    return c.json({ workspaces: [] });
  }

  const wsIds = memberships.map((m) => m.workspaceId);
  const allWorkspaces = await db.select().from(workspaces);
  const userWorkspaces = allWorkspaces.filter((ws) => wsIds.includes(ws.id));

  return c.json({
    workspaces: userWorkspaces.map((ws) => ({
      ...ws,
      role: memberships.find((m) => m.workspaceId === ws.id)?.role ?? "viewer",
    })),
  });
});

// POST /workspaces — create workspace
workspacesRouter.post("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const body = await c.req.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const now = new Date().toISOString();
  const wsId = crypto.randomUUID();

  await db.insert(workspaces).values({
    id: wsId,
    name: parsed.data.name,
    owner: userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(workspaceMembers).values({
    id: crypto.randomUUID(),
    workspaceId: wsId,
    userId,
    role: "owner",
    createdAt: now,
  });

  return c.json({ id: wsId }, 201);
});

// DELETE /workspaces/:id — delete workspace (owner only)
workspacesRouter.delete("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const wsId = c.req.param("id");

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId));
  if (!ws) return c.json({ error: "not_found" }, 404);
  if (ws.owner !== userId) return c.json({ error: "forbidden" }, 403);

  await db.delete(workspaces).where(eq(workspaces.id, wsId));
  return c.json({ ok: true });
});

// GET /workspaces/:id/members — list members
workspacesRouter.get("/:id/members", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const wsId = c.req.param("id");

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)));
  if (!membership) return c.json({ error: "forbidden" }, 403);

  const members = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, wsId));

  const userIds = members.map((m) => m.userId);
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.filter((u) => userIds.includes(u.id)).map((u) => [u.id, u]));

  return c.json({
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: userMap.get(m.userId)?.email ?? "",
      name: userMap.get(m.userId)?.name ?? "",
      role: m.role,
      createdAt: m.createdAt,
    })),
  });
});

// POST /workspaces/:id/members — invite member
workspacesRouter.post("/:id/members", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const wsId = c.req.param("id");

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)));
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const allUsers = await db.select().from(users);
  const targetUser = allUsers.find((u) => u.email === parsed.data.email);
  if (!targetUser) {
    return c.json({ error: "user_not_found", message: "No user with this email" }, 404);
  }

  const [existing] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, targetUser.id)));
  if (existing) {
    return c.json({ error: "already_member" }, 409);
  }

  const now = new Date().toISOString();
  await db.insert(workspaceMembers).values({
    id: crypto.randomUUID(),
    workspaceId: wsId,
    userId: targetUser.id,
    role: parsed.data.role,
    createdAt: now,
  });

  return c.json({ ok: true }, 201);
});

// PATCH /workspaces/:id/members/:memberId — update member role
workspacesRouter.patch("/:id/members/:memberId", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const wsId = c.req.param("id");
  const memberId = c.req.param("memberId");

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)));
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error" }, 400);
  }

  await db
    .update(workspaceMembers)
    .set({ role: parsed.data.role })
    .where(eq(workspaceMembers.id, memberId));

  return c.json({ ok: true });
});

// DELETE /workspaces/:id/members/:memberId — remove member
workspacesRouter.delete("/:id/members/:memberId", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const wsId = c.req.param("id");
  const memberId = c.req.param("memberId");

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)));
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "forbidden" }, 403);
  }

  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, memberId));
  return c.json({ ok: true });
});
