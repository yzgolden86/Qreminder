import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { subscriptionDraftSchema } from "@renewlet/shared";
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
    paymentMethod: draft.paymentMethod,
    startDate: draft.startDate,
    nextBillingDate: draft.nextBillingDate,
    autoCalculateNextBillingDate: draft.autoCalculateNextBillingDate,
    trialEndDate: draft.trialEndDate ?? null,
    website: draft.website ?? null,
    notes: draft.notes,
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
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.user, userId)));
  if (!existing) return c.json({ error: "not_found" }, 404);
  await db.update(subscriptions).set(updates).where(eq(subscriptions.id, id));
  const [updated] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id));
  return c.json({ subscription: toDto(updated!) });
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
