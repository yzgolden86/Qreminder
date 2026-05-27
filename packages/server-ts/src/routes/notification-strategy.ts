/**
 * 通知策略路由。
 *
 * 管理每订阅独立通知渠道、分类/标签默认渠道、通知模板。
 */
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { subscriptionNotificationChannels, notificationTemplates, subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import type { AppEnv } from "../app.js";

export const notificationStrategyRouter = new Hono<AppEnv>();

notificationStrategyRouter.use("*", requireSession);

// === Per-subscription channels ===

const setChannelsSchema = z.object({
  subscriptionId: z.string().min(1),
  channels: z.array(z.string().min(1)),
});

// GET /strategy/channels/:subscriptionId
notificationStrategyRouter.get("/channels/:subscriptionId", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  const subId = c.req.param("subscriptionId");

  const rows = await db
    .select()
    .from(subscriptionNotificationChannels)
    .where(
      and(
        eq(subscriptionNotificationChannels.workspaceId, workspaceId),
        eq(subscriptionNotificationChannels.subscriptionId, subId),
      ),
    );

  return c.json({ channels: rows.map((r) => r.channel) });
});

// PUT /strategy/channels — set channels for a subscription (replaces all)
notificationStrategyRouter.put("/channels", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  const parsed = setChannelsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, parsed.data.subscriptionId), eq(subscriptions.workspaceId, workspaceId)));
  if (!sub) return c.json({ error: "subscription_not_found" }, 404);

  // Delete existing
  await db
    .delete(subscriptionNotificationChannels)
    .where(
      and(
        eq(subscriptionNotificationChannels.workspaceId, workspaceId),
        eq(subscriptionNotificationChannels.subscriptionId, parsed.data.subscriptionId),
      ),
    );

  // Insert new
  const now = new Date().toISOString();
  for (const channel of parsed.data.channels) {
    await db.insert(subscriptionNotificationChannels).values({
      id: crypto.randomUUID(),
      user: userId,
      workspaceId,
      subscriptionId: parsed.data.subscriptionId,
      channel,
      createdAt: now,
    });
  }

  return c.json({ ok: true });
});

// DELETE /strategy/channels/:subscriptionId — clear custom channels (fall back to defaults)
notificationStrategyRouter.delete("/channels/:subscriptionId", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  const subId = c.req.param("subscriptionId");

  await db
    .delete(subscriptionNotificationChannels)
    .where(
      and(
        eq(subscriptionNotificationChannels.workspaceId, workspaceId),
        eq(subscriptionNotificationChannels.subscriptionId, subId),
      ),
    );

  return c.json({ ok: true });
});

// === Bulk channel assignment ===

const bulkSchema = z.object({
  subscriptionIds: z.array(z.string().min(1)).min(1).max(500),
  channels: z.array(z.string().min(1)),
  /** When true, applies even to subs that already have custom channels. */
  overwrite: z.boolean().optional(),
});

// PUT /strategy/channels/bulk — assign channels to many subscriptions at once.
// Why: configuring 50+ subscriptions one-by-one is impractical. This lets a user
// say "for all these IDs, set the channels to X". Existing per-sub channels are
// replaced when overwrite=true; otherwise skipped to be safe.
notificationStrategyRouter.put("/channels/bulk", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  // Filter the requested ids down to ones the user actually owns — prevents the
  // caller from poking at someone else's sub via a forged id.
  const ownedSubs = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  const ownedIds = new Set(ownedSubs.map((s) => s.id));
  const targetIds = parsed.data.subscriptionIds.filter((id) => ownedIds.has(id));

  if (targetIds.length === 0) {
    return c.json({ ok: true, applied: 0, skipped: parsed.data.subscriptionIds.length });
  }

  // Find which targets already have custom channels.
  const existing = await db
    .select()
    .from(subscriptionNotificationChannels)
    .where(eq(subscriptionNotificationChannels.workspaceId, workspaceId));
  const existingBySub = new Set(existing.map((r) => r.subscriptionId));

  const idsToApply = parsed.data.overwrite
    ? targetIds
    : targetIds.filter((id) => !existingBySub.has(id));

  const now = new Date().toISOString();
  for (const subId of idsToApply) {
    // Wipe existing rows for this sub (whether or not overwrite triggered) so
    // the final state matches `channels` exactly.
    await db
      .delete(subscriptionNotificationChannels)
      .where(
        and(
          eq(subscriptionNotificationChannels.workspaceId, workspaceId),
          eq(subscriptionNotificationChannels.subscriptionId, subId),
        ),
      );
    for (const channel of parsed.data.channels) {
      await db.insert(subscriptionNotificationChannels).values({
        id: crypto.randomUUID(),
        user: userId,
        workspaceId,
        subscriptionId: subId,
        channel,
        createdAt: now,
      });
    }
  }

  return c.json({
    ok: true,
    applied: idsToApply.length,
    skipped: targetIds.length - idsToApply.length + (parsed.data.subscriptionIds.length - targetIds.length),
  });
});

// === Notification Templates ===

const createTemplateSchema = z.object({
  scope: z.enum(["global", "channel", "subscription"]),
  scopeId: z.string().max(200).optional(),
  titleTemplate: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1).max(5000),
});

const updateTemplateSchema = createTemplateSchema.partial();

// GET /strategy/templates
notificationStrategyRouter.get("/templates", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  const rows = await db
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.workspaceId, workspaceId));
  return c.json({ templates: rows });
});

// POST /strategy/templates
notificationStrategyRouter.post("/templates", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(notificationTemplates).values({
    id,
    user: userId,
    workspaceId,
    scope: parsed.data.scope,
    scopeId: parsed.data.scopeId ?? "",
    titleTemplate: parsed.data.titleTemplate,
    bodyTemplate: parsed.data.bodyTemplate,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id }, 201);
});

// PATCH /strategy/templates/:id
notificationStrategyRouter.patch("/templates/:id", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  const templateId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [existing] = await db
    .select()
    .from(notificationTemplates)
    .where(and(eq(notificationTemplates.id, templateId), eq(notificationTemplates.workspaceId, workspaceId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (parsed.data.scope !== undefined) updates.scope = parsed.data.scope;
  if (parsed.data.scopeId !== undefined) updates.scopeId = parsed.data.scopeId;
  if (parsed.data.titleTemplate !== undefined) updates.titleTemplate = parsed.data.titleTemplate;
  if (parsed.data.bodyTemplate !== undefined) updates.bodyTemplate = parsed.data.bodyTemplate;

  await db.update(notificationTemplates).set(updates).where(eq(notificationTemplates.id, templateId));
  return c.json({ ok: true });
});

// DELETE /strategy/templates/:id
notificationStrategyRouter.delete("/templates/:id", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  const templateId = c.req.param("id");

  const [existing] = await db
    .select()
    .from(notificationTemplates)
    .where(and(eq(notificationTemplates.id, templateId), eq(notificationTemplates.workspaceId, workspaceId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(notificationTemplates).where(eq(notificationTemplates.id, templateId));
  return c.json({ ok: true });
});
