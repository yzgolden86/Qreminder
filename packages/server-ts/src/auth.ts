import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "./db/types.js";
import type { MailerAdapter } from "./adapters/mailer.js";
import * as schema from "./db/schema.js";
import { readSignupConfig, isEmailAllowedBySignupConfig } from "./signup-config.js";

export interface AuthOptions {
  db: Database;
  mailer: MailerAdapter;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
}

export function createAuth(options: AuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await options.mailer.send({
          to: [user.email],
          subject: "Qreminder · Reset your password",
          text: `Click the link below to reset your Qreminder password:\n\n${url}\n\nIf you did not request this, you can safely ignore this email.`,
          html: `<p>Click the link below to reset your Qreminder password:</p><p><a href="${url}">${url}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
        });
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
        banned: { type: "boolean", defaultValue: false, input: false },
        mustChangeCredentials: { type: "boolean", defaultValue: false, input: false },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") {
          return;
        }
        const config = await readSignupConfig(options.db);
        if (!config.enabled) {
          throw new APIError("FORBIDDEN", { message: "signup_disabled" });
        }
        const email = String(ctx.body?.email ?? "").trim().toLowerCase();
        if (!isEmailAllowedBySignupConfig(email, config)) {
          throw new APIError("FORBIDDEN", { message: "signup_not_allowed" });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
