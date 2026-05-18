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
  SIGNUP_ENABLED?: string;
  SIGNUP_ALLOWLIST?: string;
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

function buildApp(env: WorkerEnv) {
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
      signupEnabled: env.SIGNUP_ENABLED === "true",
      signupAllowlist: parseList(env.SIGNUP_ALLOWLIST),
    },
  };
  return createApp(deps);
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
    return env.ASSETS.fetch(request);
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
