import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { subscriptions, subscriptionPriceHistory } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { subscriptionDraftSchema } from "@qreminder/shared";
import type { AppEnv } from "../app.js";

export const subscriptionsRouter = new Hono<AppEnv>();

subscriptionsRouter.use("*", requireSession);

type SubscriptionRow = typeof subscriptions.$inferSelect;

interface ApiSubscriptionDTO {
  id: string;
  name: string;
  logo?: string;
  price: number;
  currency: string;
  billingCycle: SubscriptionRow["billingCycle"];
  customDays?: number;
  category: string;
  status: SubscriptionRow["status"];
  paymentMethod?: string;
  startDate: string;
  nextBillingDate: string;
  autoCalculateNextBillingDate: boolean;
  trialEndDate?: string;
  website?: string;
  notes?: string;
  tags?: string[];
  reminderOffsets: number[];
  snoozedUntil?: string;
  lastUsedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

function toDto(row: SubscriptionRow): ApiSubscriptionDTO {
  const dto: ApiSubscriptionDTO = {
    id: row.id,
    name: row.name,
    price: row.price,
    currency: row.currency,
    billingCycle: row.billingCycle,
    category: row.category,
    status: row.status,
    startDate: row.startDate,
    nextBillingDate: row.nextBillingDate,
    autoCalculateNextBillingDate: row.autoCalculateNextBillingDate,
    reminderOffsets: row.reminderOffsets,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.logo) dto.logo = row.logo;
  if (row.customDays != null) dto.customDays = row.customDays;
  if (row.paymentMethod) dto.paymentMethod = row.paymentMethod;
  if (row.trialEndDate) dto.trialEndDate = row.trialEndDate;
  if (row.website) dto.website = row.website;
  if (row.notes) dto.notes = row.notes;
  if (row.tags && row.tags.length > 0) dto.tags = row.tags;
  if (row.snoozedUntil) dto.snoozedUntil = row.snoozedUntil;
  if (row.lastUsedAt) dto.lastUsedAt = row.lastUsedAt;
  return dto;
}

subscriptionsRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user, userId));
  return c.json({ subscriptions: rows.map(toDto) });
});

subscriptionsRouter.get("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.user, userId)));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ subscription: toDto(row) });
});

subscriptionsRouter.post("/", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const body = await c.req.json();
  const parsed = subscriptionDraftSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }
  const draft = parsed.data;
  const now = new Date();
  const id = crypto.randomUUID();
  const record = {
    id,
    user: userId,
    name: draft.name,
    logo: draft.logo ?? "",
    price: draft.price,
    currency: draft.currency,
    billingCycle: draft.billingCycle,
    customDays: draft.customDays ?? null,
    category: draft.category,
    status: draft.status,
    paymentMethod: draft.paymentMethod ?? null,
    startDate: draft.startDate,
    nextBillingDate: draft.nextBillingDate,
    autoCalculateNextBillingDate: draft.autoCalculateNextBillingDate,
    trialEndDate: draft.trialEndDate ?? null,
    website: draft.website ?? null,
    notes: draft.notes ?? null,
    tags: draft.tags ?? [],
    extra: draft.extra ?? {},
    reminderDays: draft.reminderOffsets[0] ?? 3,
    reminderOffsets: draft.reminderOffsets,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await db.insert(subscriptions).values(record);
  const [inserted] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
  return c.json({ subscription: toDto(inserted!) }, 201);
});

subscriptionsRouter.patch("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = subscriptionDraftSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }
  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date().toISOString() };
  if (parsed.data.reminderOffsets) {
    updates.reminderDays = parsed.data.reminderOffsets[0] ?? 3;
  }
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Log price/currency change before applying the update. Only insert when
  // something actually changed — avoids noisy history rows for renames.
  const newPrice = parsed.data.price ?? existing.price;
  const newCurrency = parsed.data.currency ?? existing.currency;
  if (newPrice !== existing.price || newCurrency !== existing.currency) {
    await db.insert(subscriptionPriceHistory).values({
      id: crypto.randomUUID(),
      user: userId,
      subscriptionId: id,
      oldPrice: existing.price,
      newPrice,
      oldCurrency: existing.currency,
      newCurrency,
      changedAt: new Date().toISOString(),
    });
  }

  await db.update(subscriptions).set(updates).where(eq(subscriptions.id, id));
  const [updated] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id));
  return c.json({ subscription: toDto(updated!) });
});

subscriptionsRouter.get("/:id/price-history", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const history = await db
    .select()
    .from(subscriptionPriceHistory)
    .where(eq(subscriptionPriceHistory.subscriptionId, id))
    .orderBy(desc(subscriptionPriceHistory.changedAt));

  return c.json({ history });
});

subscriptionsRouter.delete("/:id", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);
  await db.delete(subscriptions).where(eq(subscriptions.id, id));
  return c.json({ ok: true });
});

// POST /subscriptions/:id/snooze — postpone reminders for N days.
// Why: a user who just renewed manually (or doesn't care this cycle) doesn't
// want their phone buzzing every day. Setting days=0 clears the snooze.
const snoozeSchema = z.object({
  days: z.number().int().min(0).max(365),
});

subscriptionsRouter.post("/:id/snooze", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = snoozeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
  }

  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  let snoozedUntil: string | null = null;
  if (parsed.data.days > 0) {
    const target = new Date();
    target.setDate(target.getDate() + parsed.data.days);
    snoozedUntil = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  }

  await db
    .update(subscriptions)
    .set({ snoozedUntil, updatedAt: new Date().toISOString() })
    .where(eq(subscriptions.id, id));

  return c.json({ snoozedUntil });
});

// POST /subscriptions/:id/track-usage — mark "I just used this".
// Why: drives the inactive-subscription detection (Phase 2.1) without
// needing automatic usage tracking integrations.
subscriptionsRouter.post("/:id/track-usage", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const today = new Date();
  const isoDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await db
    .update(subscriptions)
    .set({ lastUsedAt: isoDate, updatedAt: today.toISOString() })
    .where(eq(subscriptions.id, id));

  return c.json({ lastUsedAt: isoDate });
});
