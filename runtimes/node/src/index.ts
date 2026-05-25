import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { createApp, runNotificationCron } from "@qreminder/server";
import * as schema from "@qreminder/server";
import type {
  AppDeps,
  MailerAdapter,
  StorageAdapter,
  SchedulerAdapter,
  Database as QreminderDb,
} from "@qreminder/server";
import { createFsStorage } from "./fs-storage.js";
import { createNodemailerAdapter } from "./nodemailer-adapter.js";

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DATABASE_PATH ?? "./data/qreminder.db";
const assetsDir = process.env.ASSETS_DIR ?? "./data/assets";

mkdirSync(dirname(resolve(dbPath)), { recursive: true });
mkdirSync(resolve(assetsDir), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema }) as unknown as QreminderDb;

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/server-ts/drizzle",
);
migrate(drizzle(sqlite), { migrationsFolder });

const storage: StorageAdapter = createFsStorage(assetsDir);

const mailer: MailerAdapter = process.env.SMTP_HOST
  ? createNodemailerAdapter({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
      from: process.env.SMTP_FROM ?? "qreminder@example.com",
    })
  : {
      async send() {
        throw new Error("SMTP_HOST not configured");
      },
    };

const scheduler: SchedulerAdapter = { kind: "node-cron" };

const deps: AppDeps = {
  db,
  storage,
  mailer,
  scheduler,
  auth: {
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
    baseURL: process.env.APP_URL ?? `http://localhost:${port}`,
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
};

const app = createApp(deps);

const clientDistDir =
  process.env.CLIENT_DIST_DIR ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/client/dist");
const clientIndexPath = resolve(clientDistDir, "index.html");

if (existsSync(clientIndexPath)) {
  const indexHtml = readFileSync(clientIndexPath, "utf-8");
  app.use("/*", serveStatic({ root: clientDistDir }));
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
    return c.html(indexHtml);
  });
}

serve({ fetch: app.fetch, port }, ({ port: listenPort }) => {
  console.log(`qreminder-node listening on http://0.0.0.0:${listenPort}`);
});

const cronExpr = process.env.NOTIFICATION_SCHEDULER_CRON ?? "* * * * *";
const cronEnabled = process.env.NOTIFICATION_SCHEDULER_ENABLED !== "false";

if (cronEnabled) {
  let running = false;
  cron.schedule(cronExpr, async () => {
    if (running) return;
    running = true;
    try {
      const result = await runNotificationCron({ db, mailer });
      if (result.failed > 0) {
        console.warn(
          `[notification-cron] processed=${result.processed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
        );
      }
    } catch (err) {
      console.error("[notification-cron] run failed:", err);
    } finally {
      running = false;
    }
  });
}
