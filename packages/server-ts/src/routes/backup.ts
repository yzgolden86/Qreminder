/**
 * ZIP 备份导出与恢复路由。
 *
 * GET /api/backup/zip — 导出完整 ZIP 备份
 * POST /api/backup/zip/restore — 从 ZIP 恢复数据
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  subscriptions,
  settings,
  customConfigs,
  subscriptionPayments,
  budgets,
  notificationTemplates,
} from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { writeAuditLog } from "./audit-logs.js";
import type { AppEnv } from "../app.js";

export const backupRouter = new Hono<AppEnv>();

backupRouter.use("*", requireSession);

backupRouter.get("/zip", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const [userSubs, userSettings, userConfig, userPayments, userBudgets, userTemplates] =
    await Promise.all([
      db.select().from(subscriptions).where(eq(subscriptions.user, userId)),
      db.select().from(settings).where(eq(settings.user, userId)),
      db.select().from(customConfigs).where(eq(customConfigs.user, userId)),
      db.select().from(subscriptionPayments).where(eq(subscriptionPayments.user, userId)),
      db.select().from(budgets).where(eq(budgets.user, userId)),
      db.select().from(notificationTemplates).where(eq(notificationTemplates.user, userId)),
    ]);

  const settingsData = (userSettings[0]?.settings ?? {}) as Record<string, unknown>;
  const safeSettings = { ...settingsData };
  delete safeSettings["aiApiKey"];
  delete safeSettings["telegramBotToken"];
  delete safeSettings["notifyxApiKey"];
  delete safeSettings["webhookHeaders"];
  delete safeSettings["wechatWebhookUrl"];
  delete safeSettings["barkDeviceKey"];
  delete safeSettings["serverchanSendKey"];
  delete safeSettings["smtpPassword"];
  delete safeSettings["webdavPassword"];
  delete safeSettings["icalToken"];

  const metadata = {
    app: "Qreminder",
    version: "2.6.0",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
  };

  const files: Record<string, Uint8Array> = {
    "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
    "subscriptions.json": strToU8(JSON.stringify(userSubs, null, 2)),
    "payments.json": strToU8(JSON.stringify(userPayments, null, 2)),
    "settings.json": strToU8(JSON.stringify(safeSettings, null, 2)),
    "custom-config.json": strToU8(JSON.stringify(userConfig[0]?.config ?? {}, null, 2)),
    "budgets.json": strToU8(JSON.stringify(userBudgets, null, 2)),
    "templates.json": strToU8(JSON.stringify(userTemplates, null, 2)),
  };

  const zipped = zipSync(files, { level: 6 });

  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", 'attachment; filename="qreminder-backup.zip"');
  return c.body(zipped);
});

backupRouter.post("/zip/restore", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    return c.json({ error: "empty_file" }, 400);
  }
  if (body.byteLength > 50 * 1024 * 1024) {
    return c.json({ error: "file_too_large", message: "Max 50MB" }, 400);
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(body));
  } catch {
    return c.json({ error: "invalid_zip", message: "Cannot parse ZIP file" }, 400);
  }

  const metadataRaw = files["metadata.json"];
  if (!metadataRaw) {
    return c.json({ error: "invalid_backup", message: "Missing metadata.json" }, 400);
  }

  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(strFromU8(metadataRaw));
  } catch {
    return c.json({ error: "invalid_metadata", message: "Cannot parse metadata.json" }, 400);
  }

  if (metadata["app"] !== "Qreminder") {
    return c.json({ error: "not_qreminder", message: "Not a Qreminder backup" }, 400);
  }

  const now = new Date().toISOString();
  const imported = { subscriptions: 0, payments: 0, budgets: 0, templates: 0 };
  const subIdMap = new Map<string, string>();

  // Import subscriptions
  if (files["subscriptions.json"]) {
    try {
      const subs = JSON.parse(strFromU8(files["subscriptions.json"])) as Array<Record<string, unknown>>;
      const existingByName = new Map(
        (await db.select({ id: subscriptions.id, name: subscriptions.name }).from(subscriptions).where(eq(subscriptions.user, userId)))
          .map((s) => [s.name.toLowerCase(), s.id] as const),
      );

      for (const sub of subs) {
        const oldId = String(sub["id"] ?? "");
        const subName = String(sub["name"] ?? "").toLowerCase();
        const existingId = existingByName.get(subName);
        if (existingId) {
          if (oldId) subIdMap.set(oldId, existingId);
          continue;
        }
        const newId = crypto.randomUUID();
        if (oldId) subIdMap.set(oldId, newId);
        await db.insert(subscriptions).values({
          id: newId,
          user: userId,
          name: String(sub["name"] ?? ""),
          logo: String(sub["logo"] ?? ""),
          price: Number(sub["price"] ?? 0),
          currency: String(sub["currency"] ?? "CNY"),
          billingCycle: normalizeCycle(sub["billingCycle"]),
          customDays: sub["customDays"] != null ? Number(sub["customDays"]) : null,
          category: String(sub["category"] ?? ""),
          status: normalizeStatus(sub["status"]),
          paymentMethod: String(sub["paymentMethod"] ?? ""),
          startDate: String(sub["startDate"] ?? now.slice(0, 10)),
          nextBillingDate: String(sub["nextBillingDate"] ?? now.slice(0, 10)),
          autoCalculateNextBillingDate: Boolean(sub["autoCalculateNextBillingDate"] ?? true),
          trialEndDate: sub["trialEndDate"] ? String(sub["trialEndDate"]) : null,
          website: sub["website"] ? String(sub["website"]) : null,
          notes: String(sub["notes"] ?? ""),
          tags: Array.isArray(sub["tags"]) ? sub["tags"] as string[] : [],
          extra: {},
          reminderDays: Number(sub["reminderDays"] ?? 3),
          reminderOffsets: Array.isArray(sub["reminderOffsets"]) ? sub["reminderOffsets"] as number[] : [3],
          createdAt: now,
          updatedAt: now,
        });
        imported.subscriptions++;
      }
    } catch { /* skip malformed */ }
  }

  // Import payments (map old subscriptionId → new)
  if (files["payments.json"]) {
    try {
      const payments = JSON.parse(strFromU8(files["payments.json"])) as Array<Record<string, unknown>>;
      for (const p of payments) {
        const rawSubId = String(p["subscriptionId"] ?? p["subscription_id"] ?? "");
        const mappedSubId = subIdMap.get(rawSubId) ?? null;
        await db.insert(subscriptionPayments).values({
          id: crypto.randomUUID(),
          user: userId,
          subscriptionId: mappedSubId,
          subscriptionName: String(p["subscriptionName"] ?? p["subscription_name"] ?? ""),
          paidAt: String(p["paidAt"] ?? p["paid_at"] ?? now.slice(0, 10)),
          amount: Number(p["amount"] ?? 0),
          currency: String(p["currency"] ?? "CNY"),
          billingPeriod: p["billingPeriod"] ? String(p["billingPeriod"]) : null,
          paymentMethod: p["paymentMethod"] ? String(p["paymentMethod"]) : null,
          note: String(p["note"] ?? ""),
          createdAt: now,
          updatedAt: now,
        });
        imported.payments++;
      }
    } catch { /* skip malformed */ }
  }

  // Import budgets
  if (files["budgets.json"]) {
    try {
      const budgetList = JSON.parse(strFromU8(files["budgets.json"])) as Array<Record<string, unknown>>;
      for (const b of budgetList) {
        await db.insert(budgets).values({
          id: crypto.randomUUID(),
          user: userId,
          scopeType: normalizeScopeType(b["scopeType"] ?? b["scope_type"]),
          scopeId: String(b["scopeId"] ?? b["scope_id"] ?? ""),
          period: (b["period"] === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly",
          amount: Number(b["amount"] ?? 0),
          currency: String(b["currency"] ?? "CNY"),
          enabled: Boolean(b["enabled"] ?? true),
          createdAt: now,
          updatedAt: now,
        });
        imported.budgets++;
      }
    } catch { /* skip malformed */ }
  }

  // Import templates
  if (files["templates.json"]) {
    try {
      const tpls = JSON.parse(strFromU8(files["templates.json"])) as Array<Record<string, unknown>>;
      for (const tpl of tpls) {
        const scope = normalizeTemplateScope(tpl["scope"]);
        const rawScopeId = String(tpl["scopeId"] ?? tpl["scope_id"] ?? "");
        const scopeId = scope === "subscription"
          ? (subIdMap.get(rawScopeId) ?? rawScopeId)
          : rawScopeId;
        await db.insert(notificationTemplates).values({
          id: crypto.randomUUID(),
          user: userId,
          scope,
          scopeId,
          titleTemplate: String(tpl["titleTemplate"] ?? tpl["title_template"] ?? ""),
          bodyTemplate: String(tpl["bodyTemplate"] ?? tpl["body_template"] ?? ""),
          createdAt: now,
          updatedAt: now,
        });
        imported.templates++;
      }
    } catch { /* skip malformed */ }
  }

  await writeAuditLog(db, {
    userId,
    action: "backup.restore",
    targetType: "backup",
    summary: `Restored from ZIP: ${imported.subscriptions} subs, ${imported.payments} payments, ${imported.budgets} budgets, ${imported.templates} templates`,
    metadata: imported,
  });

  return c.json({ ok: true, imported });
});

function normalizeCycle(value: unknown): "weekly" | "monthly" | "quarterly" | "semi-annual" | "annual" | "custom" {
  const valid = ["weekly", "monthly", "quarterly", "semi-annual", "annual", "custom"] as const;
  const s = String(value ?? "monthly");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "monthly";
}

function normalizeStatus(value: unknown): "trial" | "active" | "paused" | "cancelled" {
  const valid = ["trial", "active", "paused", "cancelled"] as const;
  const s = String(value ?? "active");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "active";
}

function normalizeScopeType(value: unknown): "global" | "category" | "tag" | "payment_method" {
  const valid = ["global", "category", "tag", "payment_method"] as const;
  const s = String(value ?? "global");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "global";
}

function normalizeTemplateScope(value: unknown): "global" | "channel" | "subscription" {
  const valid = ["global", "channel", "subscription"] as const;
  const s = String(value ?? "global");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "global";
}
