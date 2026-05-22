import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users, sessions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const accountRouter = new Hono<AppEnv>();

const changeCredentialsSchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email(),
  newPassword: z.string().min(8),
});

accountRouter.post("/change-credentials", requireSession, async (c) => {
  const auth = c.get("auth");
  const user = c.get("user") as { id: string; email: string };
  const deps = c.get("deps");

  const body = await c.req.json().catch(() => null);
  const parsed = changeCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const { currentPassword, newEmail, newPassword } = parsed.data;

  const emailTaken = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .limit(1);
  if (emailTaken.length > 0 && emailTaken[0]!.id !== user.id) {
    return c.json({ error: "email_taken" }, 409);
  }

  try {
    await auth.api.changePassword({
      headers: c.req.raw.headers,
      body: { currentPassword, newPassword, revokeOtherSessions: true },
    });
  } catch {
    return c.json({ error: "invalid_password" }, 400);
  }

  await deps.db
    .update(users)
    .set({
      email: newEmail,
      mustChangeCredentials: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await deps.db.delete(sessions).where(eq(sessions.userId, user.id));

  return c.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

accountRouter.put("/password", requireSession, async (c) => {
  const auth = c.get("auth");

  const body = await c.req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    await auth.api.changePassword({
      headers: c.req.raw.headers,
      body: { currentPassword, newPassword, revokeOtherSessions: false },
    });
  } catch {
    return c.json({ error: "invalid_password" }, 400);
  }

  return c.json({ ok: true });
});

const changeEmailSchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email(),
});

accountRouter.patch("/email", requireSession, async (c) => {
  const auth = c.get("auth");
  const user = c.get("user") as { id: string; email: string };
  const deps = c.get("deps");

  const body = await c.req.json().catch(() => null);
  const parsed = changeEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const { currentPassword, newEmail } = parsed.data;

  if (newEmail === user.email) {
    return c.json({ ok: true, email: user.email });
  }

  const emailTaken = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .limit(1);
  if (emailTaken.length > 0 && emailTaken[0]!.id !== user.id) {
    return c.json({ error: "email_taken" }, 409);
  }

  try {
    await auth.api.changePassword({
      headers: c.req.raw.headers,
      body: { currentPassword, newPassword: currentPassword, revokeOtherSessions: false },
    });
  } catch {
    return c.json({ error: "invalid_password" }, 400);
  }

  await deps.db
    .update(users)
    .set({ email: newEmail, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return c.json({ ok: true, email: newEmail });
});
