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

function backupFilenameFromPath(path: string): string {
  const normalized = path.split("?")[0]?.replace(/\/$/, "") ?? path;
  const filename = normalized.split("/").pop() || "backup.zip";
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

webdavRouter.post("/webdav", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const [settingsRow] = await db.select().from(settings).where(and(eq(settings.user, userId), eq(settings.workspaceId, workspaceId)));
  const userSettings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const config = getWebdavConfig(userSettings);

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
