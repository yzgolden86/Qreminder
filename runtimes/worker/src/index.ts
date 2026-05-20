import { drizzle } from "drizzle-orm/d1";
import { createApp, runNotificationCron } from "@qreminder/server";
import * as schema from "@qreminder/server";
import type {
  AppDeps,
  MailerAdapter,
  StorageAdapter,
  SchedulerAdapter,
  Database as QreminderDb,
} from "@qreminder/server";
import { createR2Storage } from "./r2-storage.js";
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
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
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
  },
};
