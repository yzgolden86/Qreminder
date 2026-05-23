import { Hono } from "hono";
import type { StorageAdapter } from "./adapters/storage.js";
import type { MailerAdapter } from "./adapters/mailer.js";
import type { SchedulerAdapter } from "./adapters/scheduler.js";
import type { Database } from "./db/types.js";
import { createAuth, type Auth } from "./auth.js";
import { ensureDefaultAdmin } from "./bootstrap-default-admin.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { settingsRouter } from "./routes/settings.js";
import { assetsRouter } from "./routes/assets.js";
import { adminUsersRouter } from "./routes/admin-users.js";
import { customConfigsRouter } from "./routes/custom-configs.js";
import { accountRouter } from "./routes/account.js";
import { signupConfigRouter } from "./routes/signup-config.js";
import { notificationsRouter } from "./routes/notifications.js";
import { icalRouter } from "./routes/ical.js";
import { exportRouter } from "./routes/export.js";
import { importRouter } from "./routes/import.js";
import { paymentsRouter } from "./routes/payments.js";
import { budgetsRouter } from "./routes/budgets.js";
import { notificationStrategyRouter } from "./routes/notification-strategy.js";
import { backupRouter } from "./routes/backup.js";
import { csvImportRouter } from "./routes/csv-import.js";
import { diagnosticsRouter } from "./routes/diagnostics.js";
import { aiRouter } from "./routes/ai.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { auditLogsRouter } from "./routes/audit-logs.js";

export interface AppDeps {
  db: Database;
  storage: StorageAdapter;
  mailer: MailerAdapter;
  scheduler: SchedulerAdapter;
  auth: {
    secret: string;
    baseURL: string;
    trustedOrigins: string[];
  };
}

export interface AppEnv {
  Variables: {
    deps: AppDeps;
    auth: Auth;
    session: Awaited<ReturnType<Auth["api"]["getSession"]>> extends infer S
      ? S extends { session: infer T }
        ? T
        : never
      : never;
    user: Awaited<ReturnType<Auth["api"]["getSession"]>> extends infer S
      ? S extends { user: infer U }
        ? U
        : never
      : never;
  };
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const baseOrigin = (() => {
    try { return new URL(deps.auth.baseURL).origin; } catch { return ""; }
  })();
  const trustedOrigins = deps.auth.trustedOrigins.length > 0
    ? deps.auth.trustedOrigins
    : baseOrigin ? [baseOrigin] : [];

  const auth = createAuth({
    db: deps.db,
    mailer: deps.mailer,
    secret: deps.auth.secret,
    baseURL: deps.auth.baseURL,
    trustedOrigins,
  });

  app.use("*", async (c, next) => {
    try {
      await ensureDefaultAdmin(deps.db, deps.auth.secret, deps.auth.baseURL);
    } catch (err) {
      console.error("[bootstrap] ensureDefaultAdmin failed:", err);
    }
    c.set("deps", deps);
    c.set("auth", auth);
    await next();
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api/subscriptions", subscriptionsRouter);
  app.route("/api/settings", settingsRouter);
  app.route("/api/custom-configs", customConfigsRouter);
  app.route("/api/assets", assetsRouter);
  app.route("/api/app/admin/users", adminUsersRouter);
  app.route("/api/app/admin/signup-config", signupConfigRouter);
  app.route("/api/app/notifications", notificationsRouter);
  app.route("/api/account", accountRouter);
  app.route("/api/ical", icalRouter);
  app.route("/api/export", exportRouter);
  app.route("/api/import", importRouter);
  app.route("/api/payments", paymentsRouter);
  app.route("/api/budgets", budgetsRouter);
  app.route("/api/notification-strategy", notificationStrategyRouter);
  app.route("/api/backup", backupRouter);
  app.route("/api/import", csvImportRouter);
  app.route("/api/app/admin/diagnostics", diagnosticsRouter);
  app.route("/api/ai", aiRouter);
  app.route("/api/workspaces", workspacesRouter);
  app.route("/api/app/admin/audit-logs", auditLogsRouter);

  app.get("/api/app/health", (c) =>
    c.json({ status: "ok", runtime: deps.scheduler.kind }),
  );

  app.get("/api/app/signup-status", async (c) => {
    const { readSignupConfig } = await import("./signup-config.js");
    const config = await readSignupConfig(deps.db);
    return c.json({ enabled: config.enabled });
  });

  return app;
}
