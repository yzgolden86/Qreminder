/**
 * ZIP 备份导出与恢复路由。
 *
 * GET /api/backup/zip — 导出完整 ZIP 备份
 * POST /api/backup/zip/restore — 从 ZIP 恢复数据
 */
import { Hono } from "hono";
import { requireSession } from "../middleware/require-session.js";
import { writeAuditLog } from "./audit-logs.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import {
  BackupArchiveError,
  buildWorkspaceBackupArchive,
  restoreWorkspaceBackupArchive,
  toArrayBuffer,
} from "../lib/backup-archive.js";
import type { AppEnv } from "../app.js";

export const backupRouter = new Hono<AppEnv>();

backupRouter.use("*", requireSession);

backupRouter.get("/zip", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");
  const zipped = await buildWorkspaceBackupArchive(db, userId, workspaceId, { version: "3.1.0" });

  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", 'attachment; filename="qreminder-backup.zip"');
  return c.body(toArrayBuffer(zipped));
});

backupRouter.post("/zip/restore", requireActiveWorkspaceRole("editor"), async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    return c.json({ error: "empty_file" }, 400);
  }
  if (body.byteLength > 50 * 1024 * 1024) {
    return c.json({ error: "file_too_large", message: "Max 50MB" }, 400);
  }

  let imported;
  try {
    imported = await restoreWorkspaceBackupArchive(db, userId, workspaceId, body);
  } catch (err) {
    if (err instanceof BackupArchiveError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    }
    throw err;
  }

  await writeAuditLog(db, {
    userId,
    workspaceId,
    action: "backup.restore",
    targetType: "backup",
    summary: `Restored from ZIP: ${imported.subscriptions} subs, ${imported.payments} payments, ${imported.budgets} budgets, ${imported.templates} templates`,
    metadata: { ...imported },
  });

  return c.json({ ok: true, imported });
});
