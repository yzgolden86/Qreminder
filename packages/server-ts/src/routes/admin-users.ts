import { Hono } from "hono";
import { eq, and, asc } from "drizzle-orm";
import { users, accounts, settings as settingsTable } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { writeAuditLog } from "./audit-logs.js";
import type { AppEnv } from "../app.js";

export const adminUsersRouter = new Hono<AppEnv>();

adminUsersRouter.use("*", requireSession, async (c, next) => {
  const user = c.get("user") as { role?: string };
  if (user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
});

function toIsoString(value: Date | string | number): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return value;
}

function toUserDTO(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    banned: row.banned,
    banReason: null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

adminUsersRouter.get("/signup-config", async (c) => {
  const db = c.get("deps").db;
  const ownerId = c.get("user").id;
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.user, ownerId));
  const stored = (row?.settings as Record<string, unknown> | undefined) ?? {};
  return c.json({
    signupEnabled: Boolean(stored.signupEnabled ?? false),
    signupAllowlist: Array.isArray(stored.signupAllowlist)
      ? (stored.signupAllowlist as string[])
      : [],
  });
});

adminUsersRouter.patch("/signup-config", async (c) => {
  const db = c.get("deps").db;
  const ownerId = c.get("user").id;
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const updates: Record<string, unknown> = {};
  if (typeof body?.signupEnabled === "boolean") {
    updates.signupEnabled = body.signupEnabled;
  }
  if (Array.isArray(body?.signupAllowlist)) {
    updates.signupAllowlist = (body.signupAllowlist as unknown[])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: "no_valid_fields" }, 400);
  }
  const now = new Date().toISOString();
  const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.user, ownerId));
  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(settingsTable).values({
      id,
      user: ownerId,
      settings: updates,
      createdAt: now,
      updatedAt: now,
    });
    return c.json(updates);
  }
  const merged = { ...((existing.settings as Record<string, unknown>) ?? {}), ...updates };
  await db
    .update(settingsTable)
    .set({ settings: merged, updatedAt: now })
    .where(eq(settingsTable.id, existing.id));
  return c.json({
    signupEnabled: Boolean(merged.signupEnabled ?? false),
    signupAllowlist: Array.isArray(merged.signupAllowlist) ? merged.signupAllowlist : [],
  });
});

adminUsersRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  return c.json({ users: rows.map(toUserDTO) });
});

adminUsersRouter.post("/", async (c) => {
  const db = c.get("deps").db;
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = body.role === "admin" || body.role === "user" ? body.role : "user";
  if (!email || !email.includes("@") || password.length < 8) {
    return c.json({ error: "validation_error" }, 400);
  }

  const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (duplicate) {
    return c.json({ error: "email_exists" }, 409);
  }

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);
  const userId = crypto.randomUUID();
  const now = new Date();

  await db.insert(users).values({
    id: userId,
    email,
    emailVerified: true,
    name,
    role,
    banned: false,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    userId,
    accountId: userId,
    providerId: "credential",
    password: hashed,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db.select().from(users).where(eq(users.id, userId));
  await writeAuditLog(db, {
    userId: c.get("user").id,
    action: "admin.user.create",
    targetType: "user",
    targetId: userId,
    summary: `Created user "${email}"`,
  });
  return c.json({ user: toUserDTO(created!) }, 201);
});

adminUsersRouter.patch("/:id", async (c) => {
  const db = c.get("deps").db;
  const auth = c.get("auth");
  const id = c.req.param("id");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const allowed: Record<string, unknown> = {};
  if (typeof body.banned === "boolean") allowed.banned = body.banned;
  if (body.role === "admin" || body.role === "user") allowed.role = body.role;
  if (typeof body.name === "string") allowed.name = body.name;

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword) {
    if (newPassword.length < 8) {
      return c.json({ error: "password_too_short" }, 400);
    }
    const ctx = await auth.$context;
    const hashed = await ctx.password.hash(newPassword);
    await db
      .update(accounts)
      .set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, "credential")));
  }

  if (Object.keys(allowed).length > 0) {
    allowed.updatedAt = new Date();
    await db.update(users).set(allowed).where(eq(users.id, id));
  }

  if (!newPassword && Object.keys(allowed).length === 0) {
    return c.json({ error: "no_valid_fields" }, 400);
  }

  await writeAuditLog(db, {
    userId: c.get("user").id,
    action: "admin.user.update",
    targetType: "user",
    targetId: id,
    metadata: { fields: Object.keys(allowed), passwordChanged: Boolean(newPassword) },
  });

  return c.json({ ok: true });
});

adminUsersRouter.delete("/:id", async (c) => {
  const db = c.get("deps").db;
  const id = c.req.param("id");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
  if (!existing) return c.json({ error: "not_found" }, 404);
  await db.delete(users).where(eq(users.id, id));
  await writeAuditLog(db, {
    userId: c.get("user").id,
    action: "admin.user.delete",
    targetType: "user",
    targetId: id,
  });
  return c.json({ ok: true });
});
