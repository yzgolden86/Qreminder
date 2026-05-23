/**
 * 数据导出路由：JSON 和 CSV 格式。
 *
 * GET /api/export/json — 导出用户全部数据为 JSON
 * GET /api/export/subscriptions.csv — 导出订阅列表为 CSV
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  subscriptions,
  settings,
  customConfigs,
} from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const exportRouter = new Hono<AppEnv>();

exportRouter.use("*", requireSession);

exportRouter.get("/json", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const [userSubs, userSettings, userConfig] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.user, userId)),
    db.select().from(settings).where(eq(settings.user, userId)),
    db.select().from(customConfigs).where(eq(customConfigs.user, userId)),
  ]);

  const settingsData = (userSettings[0]?.settings ?? {}) as Record<string, unknown>;
  const configData = (userConfig[0]?.config ?? {}) as Record<string, unknown>;

  const safeSettings = { ...settingsData };
  delete safeSettings["telegramBotToken"];
  delete safeSettings["notifyxApiKey"];
  delete safeSettings["webhookHeaders"];
  delete safeSettings["wechatWebhookUrl"];
  delete safeSettings["barkDeviceKey"];
  delete safeSettings["serverchanSendKey"];
  delete safeSettings["smtpPassword"];
  delete safeSettings["icalToken"];

  const exportData = {
    app: "Qreminder",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      subscriptions: userSubs.map((s) => ({
        id: s.id,
        name: s.name,
        logo: s.logo,
        price: s.price,
        currency: s.currency,
        billingCycle: s.billingCycle,
        customDays: s.customDays,
        category: s.category,
        status: s.status,
        paymentMethod: s.paymentMethod,
        startDate: s.startDate,
        nextBillingDate: s.nextBillingDate,
        autoCalculateNextBillingDate: s.autoCalculateNextBillingDate,
        trialEndDate: s.trialEndDate,
        website: s.website,
        notes: s.notes,
        tags: s.tags,
        reminderOffsets: s.reminderOffsets,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      settings: safeSettings,
      customConfig: configData,
    },
  };

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="qreminder-export.json"');
  return c.json(exportData);
});

exportRouter.get("/subscriptions.csv", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const userSubs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user, userId));

  const headers = [
    "name",
    "price",
    "currency",
    "billingCycle",
    "nextBillingDate",
    "startDate",
    "category",
    "status",
    "paymentMethod",
    "tags",
    "website",
    "notes",
  ];

  const rows = userSubs.map((s) => [
    csvEscape(s.name),
    String(s.price),
    s.currency,
    s.billingCycle,
    s.nextBillingDate,
    s.startDate,
    csvEscape(s.category),
    s.status,
    csvEscape(s.paymentMethod ?? ""),
    csvEscape((s.tags ?? []).join(";")),
    csvEscape(s.website ?? ""),
    csvEscape(s.notes ?? ""),
  ]);

  const bom = "﻿";
  const csv = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n";

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="qreminder-subscriptions.csv"');
  return c.body(csv);
});

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
