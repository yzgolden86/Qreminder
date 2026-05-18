import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { customConfigs } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const customConfigsRouter = new Hono<AppEnv>();

customConfigsRouter.use("*", requireSession);

customConfigsRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const [row] = await db.select().from(customConfigs).where(eq(customConfigs.user, userId));
  return c.json({ config: (row?.config as Record<string, unknown> | undefined) ?? {} });
});

customConfigsRouter.patch("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "validation_error" }, 400);
  }
  const config = body as Record<string, unknown>;
  const now = new Date().toISOString();
  const [existing] = await db.select().from(customConfigs).where(eq(customConfigs.user, userId));
  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(customConfigs).values({
      id,
      user: userId,
      config,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ config });
  }
  await db
    .update(customConfigs)
    .set({ config, updatedAt: now })
    .where(eq(customConfigs.id, existing.id));
  return c.json({ config });
});
