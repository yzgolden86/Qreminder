import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { settings } from "../db/schema.js";
import { settingsSchema } from "@qreminder/shared";
import { requireSession } from "../middleware/require-session.js";
import { writeAuditLog } from "./audit-logs.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import type { AppEnv } from "../app.js";

export const settingsRouter = new Hono<AppEnv>();

settingsRouter.use("*", requireSession);

settingsRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const [row] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  return c.json({ settings: (row?.settings as Record<string, unknown> | undefined) ?? {} });
});

settingsRouter.patch("/", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json();
  const parsed = settingsSchema.partial().passthrough().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }
  const now = new Date().toISOString();
  const [existing] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(settings).values({
      id,
      user: userId,
      workspaceId,
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
  await writeAuditLog(db, {
    userId,
    action: "settings.update",
    targetType: "settings",
    metadata: { fields: Object.keys(parsed.data) },
  });
  return c.json({ settings: merged });
});

settingsRouter.post("/ical/reset-token", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const now = new Date().toISOString();
  const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const [existing] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(settings).values({
      id,
      user: userId,
      workspaceId,
      settings: { icalToken: newToken, icalEnabled: true },
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ icalToken: newToken });
  }

  const current = (existing.settings ?? {}) as Record<string, unknown>;
  const merged = { ...current, icalToken: newToken, icalEnabled: true };
  await db
    .update(settings)
    .set({ settings: merged, updatedAt: now })
    .where(eq(settings.id, existing.id));
  return c.json({ icalToken: newToken });
});

// === Category/Tag default channels ===

settingsRouter.get("/category-channels", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const [row] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const categoryDefaults = ((row?.settings as Record<string, unknown> | undefined)?.["categoryDefaultChannels"] ?? {}) as Record<string, string[]>;
  return c.json({ categoryDefaultChannels: categoryDefaults });
});

settingsRouter.put("/category-channels", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("category" in body) || !("channels" in body)) {
    return c.json({ error: "validation_error" }, 400);
  }
  const { category, channels } = body as { category: string; channels: string[] };
  if (typeof category !== "string" || !Array.isArray(channels)) {
    return c.json({ error: "validation_error" }, 400);
  }

  const now = new Date().toISOString();
  const [existing] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const current = (existing?.settings ?? {}) as Record<string, unknown>;
  const categoryDefaults = (current["categoryDefaultChannels"] ?? {}) as Record<string, string[]>;
  categoryDefaults[category] = channels;
  const merged = { ...current, categoryDefaultChannels: categoryDefaults };

  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(settings).values({
      id,
      user: userId,
      workspaceId,
      settings: merged,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(settings)
      .set({ settings: merged, updatedAt: now })
      .where(eq(settings.id, existing.id));
  }
  return c.json({ ok: true });
});

settingsRouter.delete("/category-channels/:category", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const category = c.req.param("category");
  const [existing] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  if (!existing) return c.json({ ok: true });

  const current = (existing.settings ?? {}) as Record<string, unknown>;
  const categoryDefaults = (current["categoryDefaultChannels"] ?? {}) as Record<string, string[]>;
  delete categoryDefaults[category];
  const merged = { ...current, categoryDefaultChannels: categoryDefaults };
  const now = new Date().toISOString();
  await db
    .update(settings)
    .set({ settings: merged, updatedAt: now })
    .where(eq(settings.id, existing.id));
  return c.json({ ok: true });
});

settingsRouter.get("/tag-channels", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const [row] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const tagDefaults = ((row?.settings as Record<string, unknown> | undefined)?.["tagDefaultChannels"] ?? {}) as Record<string, string[]>;
  return c.json({ tagDefaultChannels: tagDefaults });
});

settingsRouter.put("/tag-channels", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("tag" in body) || !("channels" in body)) {
    return c.json({ error: "validation_error" }, 400);
  }
  const { tag, channels } = body as { tag: string; channels: string[] };
  if (typeof tag !== "string" || !Array.isArray(channels)) {
    return c.json({ error: "validation_error" }, 400);
  }

  const now = new Date().toISOString();
  const [existing] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const current = (existing?.settings ?? {}) as Record<string, unknown>;
  const tagDefaults = (current["tagDefaultChannels"] ?? {}) as Record<string, string[]>;
  tagDefaults[tag] = channels;
  const merged = { ...current, tagDefaultChannels: tagDefaults };

  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(settings).values({
      id,
      user: userId,
      workspaceId,
      settings: merged,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(settings)
      .set({ settings: merged, updatedAt: now })
      .where(eq(settings.id, existing.id));
  }
  return c.json({ ok: true });
});

settingsRouter.delete("/tag-channels/:tag", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const tag = c.req.param("tag");
  const [existing] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  if (!existing) return c.json({ ok: true });

  const current = (existing.settings ?? {}) as Record<string, unknown>;
  const tagDefaults = (current["tagDefaultChannels"] ?? {}) as Record<string, string[]>;
  delete tagDefaults[tag];
  const merged = { ...current, tagDefaultChannels: tagDefaults };
  const now = new Date().toISOString();
  await db
    .update(settings)
    .set({ settings: merged, updatedAt: now })
    .where(eq(settings.id, existing.id));
  return c.json({ ok: true });
});
