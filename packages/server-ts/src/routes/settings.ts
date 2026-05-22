import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { settings } from "../db/schema.js";
import { settingsSchema } from "@qreminder/shared";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const settingsRouter = new Hono<AppEnv>();

settingsRouter.use("*", requireSession);

settingsRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const [row] = await db.select().from(settings).where(eq(settings.user, userId));
  return c.json({ settings: (row?.settings as Record<string, unknown> | undefined) ?? {} });
});

settingsRouter.patch("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = settingsSchema.partial().passthrough().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }
  const now = new Date().toISOString();
  const [existing] = await db.select().from(settings).where(eq(settings.user, userId));
  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(settings).values({
      id,
      user: userId,
      settings: parsed.data as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ settings: parsed.data });
  }
  const merged = { ...(existing.settings ?? {}), ...parsed.data };
  await db
    .update(settings)
    .set({ settings: merged, updatedAt: now })
    .where(eq(settings.id, existing.id));
  return c.json({ settings: merged });
});
