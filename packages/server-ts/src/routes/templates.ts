/**
 * 订阅模板路由。
 *
 * 模板是创建订阅时的预设：分类、标签、通知渠道、付款方式、扣费周期、提醒档位。
 * 用户可以手动创建模板，或把现有订阅「另存为模板」。从模板创建订阅时前端读取
 * 模板字段预填表单——name/price/currency 留空由用户填写，模板只是脚手架。
 *
 * 端点：
 * - GET    /api/templates                     列出当前工作空间模板（按使用次数排序）
 * - POST   /api/templates                     创建模板
 * - PATCH  /api/templates/:id                 编辑模板
 * - DELETE /api/templates/:id                 删除模板
 * - POST   /api/templates/from-subscription/:subscriptionId  从订阅另存为模板
 * - POST   /api/templates/:id/use             使用计数 +1（前端确认创建订阅后调用）
 */
import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { subscriptionTemplates, subscriptions, subscriptionNotificationChannels } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import { writeAuditLog } from "./audit-logs.js";
import type { AppEnv } from "../app.js";

export const templatesRouter = new Hono<AppEnv>();

templatesRouter.use("*", requireSession);

const billingCycleEnum = z.enum(["weekly", "monthly", "quarterly", "semi-annual", "annual", "custom"]);

const templateFieldsSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  defaultChannels: z.array(z.string().max(50)).max(10).optional(),
  paymentMethod: z.string().max(100).optional(),
  billingCycle: billingCycleEnum.optional(),
  customDays: z.number().int().positive().max(3650).nullable().optional(),
  reminderOffsets: z.array(z.number().int().nonnegative().max(365)).max(10).optional(),
  notes: z.string().max(2000).optional(),
  logoUrl: z.string().max(500).optional(),
});

const updateTemplateSchema = templateFieldsSchema.partial();

// GET /templates — list templates for current workspace, most-used first
templatesRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");

  const rows = await db
    .select()
    .from(subscriptionTemplates)
    .where(eq(subscriptionTemplates.workspaceId, workspaceId))
    .orderBy(desc(subscriptionTemplates.usageCount), desc(subscriptionTemplates.updatedAt));

  return c.json({ templates: rows });
});

// POST /templates — create a template
templatesRouter.post("/", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const body = await c.req.json().catch(() => null);
  const parsed = templateFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(subscriptionTemplates).values({
    id,
    user: userId,
    workspaceId,
    name: parsed.data.name,
    category: parsed.data.category ?? "",
    tags: parsed.data.tags ?? [],
    defaultChannels: parsed.data.defaultChannels ?? [],
    paymentMethod: parsed.data.paymentMethod ?? "",
    billingCycle: parsed.data.billingCycle ?? "monthly",
    customDays: parsed.data.customDays ?? null,
    reminderOffsets: parsed.data.reminderOffsets ?? [3],
    notes: parsed.data.notes ?? "",
    logoUrl: parsed.data.logoUrl ?? "",
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "template.create",
    targetType: "template",
    targetId: id,
    summary: `Created template "${parsed.data.name}"`,
  });

  return c.json({ id }, 201);
});

// PATCH /templates/:id — update a template
templatesRouter.patch("/:id", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const templateId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [existing] = await db
    .select()
    .from(subscriptionTemplates)
    .where(and(eq(subscriptionTemplates.id, templateId), eq(subscriptionTemplates.workspaceId, workspaceId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  for (const key of [
    "name", "category", "tags", "defaultChannels", "paymentMethod",
    "billingCycle", "customDays", "reminderOffsets", "notes", "logoUrl",
  ] as const) {
    if (parsed.data[key] !== undefined) updates[key] = parsed.data[key];
  }

  await db
    .update(subscriptionTemplates)
    .set(updates)
    .where(eq(subscriptionTemplates.id, templateId));

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "template.update",
    targetType: "template",
    targetId: templateId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return c.json({ ok: true });
});

// DELETE /templates/:id — delete a template
templatesRouter.delete("/:id", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const templateId = c.req.param("id");

  const [existing] = await db
    .select()
    .from(subscriptionTemplates)
    .where(and(eq(subscriptionTemplates.id, templateId), eq(subscriptionTemplates.workspaceId, workspaceId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(subscriptionTemplates).where(eq(subscriptionTemplates.id, templateId));

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "template.delete",
    targetType: "template",
    targetId: templateId,
    summary: `Deleted template "${existing.name}"`,
  });

  return c.json({ ok: true });
});

// POST /templates/from-subscription/:subscriptionId — save subscription as template
templatesRouter.post("/from-subscription/:subscriptionId", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const subId = c.req.param("subscriptionId");
  const body = await c.req.json().catch(() => ({}));
  // 允许覆盖模板名，默认用订阅名。
  const nameOverride = typeof (body as Record<string, unknown>)["name"] === "string"
    ? ((body as Record<string, unknown>)["name"] as string).slice(0, 100)
    : null;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subId), eq(subscriptions.workspaceId, workspaceId)));
  if (!sub) return c.json({ error: "subscription_not_found" }, 404);

  // 继承订阅的独立通知渠道作为模板默认渠道。
  const channelRows = await db
    .select({ channel: subscriptionNotificationChannels.channel })
    .from(subscriptionNotificationChannels)
    .where(
      and(
        eq(subscriptionNotificationChannels.subscriptionId, subId),
        eq(subscriptionNotificationChannels.workspaceId, workspaceId),
      ),
    );

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(subscriptionTemplates).values({
    id,
    user: userId,
    workspaceId,
    name: nameOverride ?? sub.name,
    category: sub.category,
    tags: sub.tags,
    defaultChannels: channelRows.map((r) => r.channel),
    paymentMethod: sub.paymentMethod ?? "",
    billingCycle: sub.billingCycle,
    customDays: sub.customDays,
    reminderOffsets: sub.reminderOffsets,
    notes: sub.notes ?? "",
    logoUrl: sub.logo ?? "",
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "template.createFromSubscription",
    targetType: "template",
    targetId: id,
    summary: `Saved "${sub.name}" as template`,
    metadata: { subscriptionId: subId },
  });

  return c.json({ id }, 201);
});

// POST /templates/:id/use — bump usage counter (called after a subscription is
// actually created from this template; keeps the "most used" sort meaningful)
templatesRouter.post("/:id/use", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  const templateId = c.req.param("id");

  const [existing] = await db
    .select({ id: subscriptionTemplates.id })
    .from(subscriptionTemplates)
    .where(and(eq(subscriptionTemplates.id, templateId), eq(subscriptionTemplates.workspaceId, workspaceId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db
    .update(subscriptionTemplates)
    .set({
      usageCount: sql`${subscriptionTemplates.usageCount} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(subscriptionTemplates.id, templateId));

  return c.json({ ok: true });
});
