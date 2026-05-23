/**
 * WebDAV 备份路由。
 *
 * POST /api/backup/webdav — 手动触发 WebDAV 备份
 * POST /api/backup/webdav/restore — 从 WebDAV 恢复最新备份
 * GET /api/backup/webdav/status — 查询最近备份状态
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
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

  const [settingsRow] = await db.select().from(settings).where(eq(settings.user, userId));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const config = getWebdavConfig(userSettings);

  if (!config.enabled || !config.url || !config.username) {
    return c.json({ error: "webdav_not_configured", message: "Please configure WebDAV in settings" }, 400);
  }

  const [userSubs, userPayments, userBudgets, userConfig, userTemplates] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.user, userId)),
    db.select().from(subscriptionPayments).where(eq(subscriptionPayments.user, userId)),
    db.select().from(budgets).where(eq(budgets.user, userId)),
    db.select().from(customConfigs).where(eq(customConfigs.user, userId)),
    db.select().from(notificationTemplates).where(eq(notificationTemplates.user, userId)),
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

webdavRouter.post("/webdav/restore", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;

  const [settingsRow] = await db.select().from(settings).where(eq(settings.user, userId));
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

    let imported = 0;
    if (files["subscriptions.json"]) {
      const subs = JSON.parse(strFromU8(files["subscriptions.json"])) as Array<Record<string, unknown>>;
      const existingNames = new Set(
        (await db.select({ name: subscriptions.name }).from(subscriptions).where(eq(subscriptions.user, userId)))
          .map((s) => s.name.toLowerCase()),
      );
      const now = new Date().toISOString();
      for (const sub of subs) {
        const name = String(sub["name"] ?? "");
        if (!name || existingNames.has(name.toLowerCase())) continue;
        await db.insert(subscriptions).values({
          id: crypto.randomUUID(),
          user: userId,
          name,
          logo: String(sub["logo"] ?? ""),
          price: Number(sub["price"] ?? 0),
          currency: String(sub["currency"] ?? "CNY"),
          billingCycle: "monthly" as const,
          customDays: null,
          category: String(sub["category"] ?? ""),
          status: "active" as const,
          paymentMethod: String(sub["paymentMethod"] ?? ""),
          startDate: String(sub["startDate"] ?? now.slice(0, 10)),
          nextBillingDate: String(sub["nextBillingDate"] ?? now.slice(0, 10)),
          autoCalculateNextBillingDate: true,
          trialEndDate: null,
          website: null,
          notes: "",
          tags: [],
          extra: {},
          reminderDays: 3,
          reminderOffsets: [3],
          createdAt: now,
          updatedAt: now,
        });
        imported++;
      }
    }

    return c.json({ ok: true, imported, source: latestPath });
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

  const [settingsRow] = await db.select().from(settings).where(eq(settings.user, userId));
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
