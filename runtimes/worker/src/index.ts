import { drizzle } from "drizzle-orm/d1";
import { createApp, runNotificationCron, runAuditRetention, runAutoBackup } from "@qreminder/server";
import * as schema from "@qreminder/server";
import type {
  AppDeps,
  MailerAdapter,
  StorageAdapter,
  SchedulerAdapter,
  Database as QreminderDb,
} from "@qreminder/server";
import { createR2Storage } from "./r2-storage.js";
import { createR2BackupStore } from "./r2-backup-store.js";
import { createResendAdapter } from "./resend-adapter.js";

export interface WorkerEnv {
  QREMINDER_DB: D1Database;
  QREMINDER_ASSETS: R2Bucket;
  ASSETS: Fetcher;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
  TRUSTED_ORIGINS?: string;
  AUDIT_RETENTION_DAYS?: string;
  BACKUP_RETENTION_DAYS?: string;
}

const scheduler: SchedulerAdapter = { kind: "cf-cron-trigger" };

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildEnv(env: WorkerEnv) {
  const db = drizzle(env.QREMINDER_DB, { schema }) as unknown as QreminderDb;
  const storage: StorageAdapter = createR2Storage(env.QREMINDER_ASSETS);
  const mailer: MailerAdapter = createResendAdapter({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
  });
  return { db, storage, mailer };
}

// Cache app instance per environment to avoid recreating auth on every request
let cachedApp: ReturnType<typeof createApp> | null = null;
let cachedEnvHash: string | null = null;

function getEnvHash(env: WorkerEnv): string {
  return `${env.BETTER_AUTH_SECRET}-${env.APP_URL}`;
}

function buildApp(env: WorkerEnv) {
  const envHash = getEnvHash(env);
  if (cachedApp && cachedEnvHash === envHash) {
    return cachedApp;
  }

  const { db, storage, mailer } = buildEnv(env);
  const deps: AppDeps = {
    db,
    storage,
    mailer,
    scheduler,
    auth: {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
      trustedOrigins: parseList(env.TRUSTED_ORIGINS),
    },
  };

  cachedApp = createApp(deps);
  cachedEnvHash = envHash;
  return cachedApp;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      return buildApp(env).fetch(request);
    }
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status === 404 && request.method === "GET" && !url.pathname.includes(".")) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return assetResponse;
  },
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    const { db, mailer } = buildEnv(env);
    ctx.waitUntil(
      runNotificationCron({ db, mailer })
        .then((result) => {
          if (result.failed > 0) {
            console.warn(
              `[notification-cron] processed=${result.processed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
            );
          }
        })
        .catch((err) => console.error("[notification-cron] run failed:", err)),
    );

    // Daily housekeeping at 03:00 UTC — cron fires every minute, so gate by clock.
    const fireAt = new Date(event.scheduledTime);
    if (fireAt.getUTCHours() === 3 && fireAt.getUTCMinutes() === 0) {
      const retentionDays = Number(env.AUDIT_RETENTION_DAYS ?? "180");
      ctx.waitUntil(
        runAuditRetention(db, { retentionDays })
          .then((result) => {
            if (result.deletedCount > 0) {
              console.log(
                `[audit-retention] deleted=${result.deletedCount} cutoff=${result.cutoffDate}`,
              );
            }
          })
          .catch((err) => console.error("[audit-retention] run failed:", err)),
      );

      const backupRetention = Number(env.BACKUP_RETENTION_DAYS ?? "30");
      const backupStore = createR2BackupStore(env.QREMINDER_ASSETS);
      ctx.waitUntil(
        runAutoBackup(db, backupStore, { retentionDays: backupRetention })
          .then((result) => {
            console.log(
              `[auto-backup] key=${result.key} bytes=${result.sizeBytes} rotated=${result.deletedOldBackups}`,
            );
          })
          .catch((err) => console.error("[auto-backup] run failed:", err)),
      );
    }
  },
};
