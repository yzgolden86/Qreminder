/**
 * WebDAV 备份路由。
 *
 * POST /api/backup/webdav — 手动触发 WebDAV 备份
 * POST /api/backup/webdav/restore — 从 WebDAV 恢复最新备份
 * GET /api/backup/webdav/status — 查询最近备份状态
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import {
  subscriptions,
  settings,
  customConfigs,
  subscriptionPayments,
  budgets,
  notificationTemplates,
} from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import type { AppEnv } from "../app.js";

export const webdavRouter = new Hono<AppEnv>();

webdavRouter.use("*", requireSession);

interface WebdavConfig {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  path: string;
}

function getWebdavConfig(userSettings: Record<string, unknown>): WebdavConfig {
  return {
    enabled: Boolean(userSettings["webdavEnabled"]),
    url: String(userSettings["webdavUrl"] ?? "").trim().replace(/\/$/, ""),
    username: String(userSettings["webdavUsername"] ?? "").trim(),
    password: String(userSettings["webdavPassword"] ?? "").trim(),
    path: String(userSettings["webdavPath"] ?? "/qreminder-backup/").trim(),
  };
}

function webdavHeaders(config: WebdavConfig): Record<string, string> {
  const auth = btoa(`${config.username}:${config.password}`);
  return { Authorization: `Basic ${auth}` };
}

webdavRouter.post("/webdav", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const [settingsRow] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const config = getWebdavConfig(userSettings);

  if (!config.enabled || !config.url || !config.username) {
    return c.json({ error: "webdav_not_configured", message: "Please configure WebDAV in settings" }, 400);
  }

  const [userSubs, userPayments, userBudgets, userConfig, userTemplates] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)),
    db.select().from(subscriptionPayments).where(eq(subscriptionPayments.workspaceId, workspaceId)),
    db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId)),
    db.select().from(customConfigs).where(and(eq(customConfigs.user, userId), eq(customConfigs.workspaceId, workspaceId))),
    db.select().from(notificationTemplates).where(eq(notificationTemplates.workspaceId, workspaceId)),
  ]);

  const safeSettings = { ...userSettings };
  delete safeSettings["aiApiKey"];
  delete safeSettings["telegramBotToken"];
  delete safeSettings["notifyxApiKey"];
  delete safeSettings["wechatWebhookUrl"];
  delete safeSettings["barkDeviceKey"];
  delete safeSettings["serverchanSendKey"];
  delete safeSettings["smtpPassword"];
  delete safeSettings["webdavPassword"];

  const metadata = {
    app: "Qreminder",
    version: "3.0.0",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "webdav-auto",
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
  const filename = `qreminder-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const remotePath = `${config.url}${config.path}${filename}`;

  try {
    await fetch(`${config.url}${config.path}`, {
      method: "MKCOL",
      headers: webdavHeaders(config),
    }).catch(() => {});

    const uploadRes = await fetch(remotePath, {
      method: "PUT",
      headers: {
        ...webdavHeaders(config),
        "Content-Type": "application/zip",
      },
      body: zipped,
    });

    if (!uploadRes.ok && uploadRes.status !== 201 && uploadRes.status !== 204) {
      return c.json({ error: "webdav_upload_failed", message: `HTTP ${uploadRes.status}` }, 500);
    }

    return c.json({ ok: true, filename, size: zipped.byteLength });
  } catch (err) {
    return c.json({
      error: "webdav_error",
      message: err instanceof Error ? err.message : "WebDAV request failed",
    }, 500);
  }
});

webdavRouter.post("/webdav/restore", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const [settingsRow] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const config = getWebdavConfig(userSettings);

  if (!config.enabled || !config.url || !config.username) {
    return c.json({ error: "webdav_not_configured" }, 400);
  }

  try {
    const listRes = await fetch(`${config.url}${config.path}`, {
      method: "PROPFIND",
      headers: { ...webdavHeaders(config), Depth: "1" },
    });

    if (!listRes.ok) {
      return c.json({ error: "webdav_list_failed", message: `HTTP ${listRes.status}` }, 500);
    }

    const listBody = await listRes.text();
    const zipFiles = [...listBody.matchAll(/href>([^<]*\.zip)</g)]
      .map((m) => m[1]!)
      .sort()
      .reverse();

    if (zipFiles.length === 0) {
      return c.json({ error: "no_backup_found", message: "No ZIP backups found on WebDAV" }, 404);
    }

    const latestPath = zipFiles[0]!.startsWith("http")
      ? zipFiles[0]!
      : `${config.url}${zipFiles[0]}`;

    const downloadRes = await fetch(latestPath, {
      headers: webdavHeaders(config),
    });

    if (!downloadRes.ok) {
      return c.json({ error: "webdav_download_failed", message: `HTTP ${downloadRes.status}` }, 500);
    }

    const zipData = new Uint8Array(await downloadRes.arrayBuffer());
    const files = unzipSync(zipData);

    const metadataRaw = files["metadata.json"];
    if (!metadataRaw) {
      return c.json({ error: "invalid_backup", message: "Missing metadata.json" }, 400);
    }

    const metadata = JSON.parse(strFromU8(metadataRaw));
    if (metadata["app"] !== "Qreminder") {
      return c.json({ error: "not_qreminder" }, 400);
    }

    let imported = { subscriptions: 0, payments: 0, budgets: 0, templates: 0 };
    const subIdMap = new Map<string, string>();

    if (files["subscriptions.json"]) {
      const subs = JSON.parse(strFromU8(files["subscriptions.json"])) as Array<Record<string, unknown>>;
      const existingByName = new Map(
        (await db.select({ id: subscriptions.id, name: subscriptions.name }).from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)))
          .map((s) => [s.name.toLowerCase(), s.id] as const),
      );
      const now = new Date().toISOString();
      for (const sub of subs) {
        const oldId = String(sub["id"] ?? "");
        const name = String(sub["name"] ?? "");
        if (!name) continue;
        const existingId = existingByName.get(name.toLowerCase());
        if (existingId) {
          if (oldId) subIdMap.set(oldId, existingId);
          continue;
        }
        const newId = crypto.randomUUID();
        if (oldId) subIdMap.set(oldId, newId);
        await db.insert(subscriptions).values({
          id: newId,
          user: userId,
          workspaceId,
          name,
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
    }

    if (files["payments.json"]) {
      try {
        const payments = JSON.parse(strFromU8(files["payments.json"])) as Array<Record<string, unknown>>;
        const now = new Date().toISOString();
        for (const p of payments) {
          const rawSubId = String(p["subscriptionId"] ?? p["subscription_id"] ?? "");
          const mappedSubId = subIdMap.get(rawSubId) ?? null;
          await db.insert(subscriptionPayments).values({
            id: crypto.randomUUID(),
            user: userId,
            workspaceId,
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

    if (files["budgets.json"]) {
      try {
        const budgetList = JSON.parse(strFromU8(files["budgets.json"])) as Array<Record<string, unknown>>;
        const now = new Date().toISOString();
        for (const b of budgetList) {
          await db.insert(budgets).values({
            id: crypto.randomUUID(),
            user: userId,
            workspaceId,
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

    if (files["templates.json"]) {
      try {
        const tpls = JSON.parse(strFromU8(files["templates.json"])) as Array<Record<string, unknown>>;
        const now = new Date().toISOString();
        for (const tpl of tpls) {
          const scope = normalizeTemplateScope(tpl["scope"]);
          const rawScopeId = String(tpl["scopeId"] ?? tpl["scope_id"] ?? "");
          const scopeId = scope === "subscription"
            ? (subIdMap.get(rawScopeId) ?? rawScopeId)
            : rawScopeId;
          await db.insert(notificationTemplates).values({
            id: crypto.randomUUID(),
            user: userId,
            workspaceId,
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

    return c.json({ ok: true, imported: imported.subscriptions + imported.payments + imported.budgets + imported.templates, source: latestPath });
  } catch (err) {
    return c.json({
      error: "webdav_error",
      message: err instanceof Error ? err.message : "WebDAV restore failed",
    }, 500);
  }
});

webdavRouter.get("/webdav/status", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const [settingsRow] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const config = getWebdavConfig(userSettings);

  if (!config.enabled || !config.url) {
    return c.json({ configured: false });
  }

  try {
    const res = await fetch(`${config.url}${config.path}`, {
      method: "PROPFIND",
      headers: { ...webdavHeaders(config), Depth: "1" },
    });

    if (!res.ok) {
      return c.json({ configured: true, reachable: false, error: `HTTP ${res.status}` });
    }

    const body = await res.text();
    const zipCount = (body.match(/\.zip/g) || []).length;

    return c.json({ configured: true, reachable: true, backupCount: zipCount });
  } catch (err) {
    return c.json({
      configured: true,
      reachable: false,
      error: err instanceof Error ? err.message : "Connection failed",
    });
  }
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
