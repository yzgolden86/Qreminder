/**
 * 审计日志保留清理器。
 *
 * 定期清理超过保留期的审计日志，避免 D1 表无限膨胀。
 * 默认保留 180 天，可通过 options 覆盖。
 */
import { lt } from "drizzle-orm";
import { auditLogs } from "../db/schema.js";
import type { Database } from "../db/types.js";

export interface AuditRetentionOptions {
  now?: Date;
  retentionDays?: number;
}

export interface AuditRetentionResult {
  deletedCount: number;
  cutoffDate: string;
  retentionDays: number;
}

export async function runAuditRetention(
  db: Database,
  options: AuditRetentionOptions = {},
): Promise<AuditRetentionResult> {
  const retentionDays = options.retentionDays ?? 180;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString();

  const deleted = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoffISO))
    .returning({ id: auditLogs.id });

  return {
    deletedCount: deleted.length,
    cutoffDate: cutoffISO,
    retentionDays,
  };
}
