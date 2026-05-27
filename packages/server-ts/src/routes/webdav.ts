/**
 * WebDAV 备份路由。
 *
 * POST /api/backup/webdav — 手动触发 WebDAV 备份
 * POST /api/backup/webdav/restore — 从 WebDAV 恢复最新备份
 * GET /api/backup/webdav/status — 查询最近备份状态
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { settings } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import { writeAuditLog } from "./audit-logs.js";
import {
  BackupArchiveError,
  buildWorkspaceBackupArchive,
  toArrayBuffer,
  restoreWorkspaceBackupArchive,
  totalRestoredCount,
} from "../lib/backup-archive.js";
import { assertExternalHttpUrl } from "../lib/external-url.js";
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
    url: normalizeWebdavUrl(String(userSettings["webdavUrl"] ?? "")),
    username: String(userSettings["webdavUsername"] ?? "").trim(),
    password: String(userSettings["webdavPassword"] ?? "").trim(),
    path: normalizeWebdavPath(String(userSettings["webdavPath"] ?? "/qreminder-backup/")),
  };
}

function normalizeWebdavUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const url = assertExternalHttpUrl(trimmed);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function normalizeWebdavPath(path: string): string {
  const trimmed = path.trim() || "/qreminder-backup/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function webdavHeaders(config: WebdavConfig): Record<string, string> {
  const auth = btoa(`${config.username}:${config.password}`);
  return { Authorization: `Basic ${auth}` };
}

function backupFilenameFromPath(path: string): string {
  const normalized = path.split("?")[0]?.replace(/\/$/, "") ?? path;
  const filename = normalized.split("/").pop() || "backup.zip";
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

async function webdavFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const safeUrl = assertExternalHttpUrl(url).toString();
  const response = await fetch(safeUrl, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("WebDAV redirects are not allowed");
  }
  return response;
}

function resolveWebdavHref(href: string, config: WebdavConfig): string {
  const resolved = assertExternalHttpUrl(new URL(href, `${config.url}${config.path}`).toString());
  const configuredOrigin = new URL(config.url).origin;
  if (resolved.origin !== configuredOrigin) {
    throw new Error("WebDAV backup URL must stay on the configured host");
  }
  return resolved.toString();
}

function invalidWebdavUrlResponse() {
  return { error: "invalid_webdav_url", message: "WebDAV URL must be a public http/https URL" };
}

webdavRouter.post("/webdav", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const [settingsRow] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  let config: WebdavConfig;
  try {
    config = getWebdavConfig(userSettings);
  } catch {
    return c.json(invalidWebdavUrlResponse(), 400);
  }

  if (!config.enabled || !config.url || !config.username) {
    return c.json({ error: "webdav_not_configured", message: "Please configure WebDAV in settings" }, 400);
  }

  const zipped = await buildWorkspaceBackupArchive(db, userId, workspaceId, {
    version: "3.1.0",
    source: "webdav-manual",
  });
  const filename = `qreminder-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const remotePath = `${config.url}${config.path}${filename}`;

  try {
    await webdavFetch(`${config.url}${config.path}`, {
      method: "MKCOL",
      headers: webdavHeaders(config),
    }).catch(() => {});

    const uploadRes = await webdavFetch(remotePath, {
      method: "PUT",
      headers: {
        ...webdavHeaders(config),
        "Content-Type": "application/zip",
      },
      body: toArrayBuffer(zipped),
    });

    if (!uploadRes.ok && uploadRes.status !== 201 && uploadRes.status !== 204) {
      return c.json({ error: "webdav_upload_failed", message: `HTTP ${uploadRes.status}` }, 500);
    }

    await writeAuditLog(db, {
      userId,
      workspaceId,
      action: "backup.webdav.upload",
      targetType: "backup",
      summary: `Uploaded WebDAV backup ${filename}`,
      metadata: {
        filename,
        size: zipped.byteLength,
      },
    });

    return c.json({ ok: true, filename, size: zipped.byteLength });
  } catch (err) {
    return c.json({
      error: "webdav_error",
      message: err instanceof Error ? err.message : "WebDAV request failed",
    }, 500);
  }
});

export const __testing__ = {
  normalizeWebdavPath,
  normalizeWebdavUrl,
  resolveWebdavHref,
};

webdavRouter.post("/webdav/restore", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const [settingsRow] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  let config: WebdavConfig;
  try {
    config = getWebdavConfig(userSettings);
  } catch {
    return c.json(invalidWebdavUrlResponse(), 400);
  }

  if (!config.enabled || !config.url || !config.username) {
    return c.json({ error: "webdav_not_configured" }, 400);
  }

  try {
    const listRes = await webdavFetch(`${config.url}${config.path}`, {
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

    const latestPath = resolveWebdavHref(zipFiles[0]!, config);

    const downloadRes = await webdavFetch(latestPath, {
      headers: webdavHeaders(config),
    });

    if (!downloadRes.ok) {
      return c.json({ error: "webdav_download_failed", message: `HTTP ${downloadRes.status}` }, 500);
    }

    const imported = await restoreWorkspaceBackupArchive(
      db,
      userId,
      workspaceId,
      await downloadRes.arrayBuffer(),
    );
    const sourceFile = backupFilenameFromPath(zipFiles[0]!);

    await writeAuditLog(db, {
      userId,
      workspaceId,
      action: "backup.webdav.restore",
      targetType: "backup",
      summary: `Restored WebDAV backup ${sourceFile}`,
      metadata: {
        sourceFile,
        imported: totalRestoredCount(imported),
        details: imported,
      },
    });

    return c.json({
      ok: true,
      imported: totalRestoredCount(imported),
      details: imported,
      source: latestPath,
    });
  } catch (err) {
    if (err instanceof BackupArchiveError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
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
  let config: WebdavConfig;
  try {
    config = getWebdavConfig(userSettings);
  } catch {
    return c.json({ configured: true, reachable: false, error: invalidWebdavUrlResponse().message });
  }

  if (!config.enabled || !config.url) {
    return c.json({ configured: false });
  }

  try {
    const res = await webdavFetch(`${config.url}${config.path}`, {
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
