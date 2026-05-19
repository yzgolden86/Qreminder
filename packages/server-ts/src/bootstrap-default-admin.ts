import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, sql } from "drizzle-orm";
import * as schema from "./db/schema.js";
import type { Database } from "./db/types.js";

export const DEFAULT_ADMIN_EMAIL = "admin@qreminder.local";
export const DEFAULT_ADMIN_PASSWORD = "Qreminder@2026";

let bootstrapped = false;

export async function ensureDefaultAdmin(db: Database, secret: string, baseURL: string): Promise<void> {
  if (bootstrapped) return;

  const rows = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
  const count = Number(rows[0]?.count ?? 0);
  if (count > 0) {
    bootstrapped = true;
    return;
  }

  const bootstrapAuth = betterAuth({
    secret,
    baseURL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 8 },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
        banned: { type: "boolean", defaultValue: false, input: false },
        mustChangeCredentials: { type: "boolean", defaultValue: false, input: false },
      },
    },
  });

  try {
    await bootstrapAuth.api.signUpEmail({
      body: {
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        name: "Admin",
      },
    });
  } catch (err) {
    const recheck = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    if (Number(recheck[0]?.count ?? 0) === 0) throw err;
    return;
  }

  await db
    .update(schema.users)
    .set({
      role: "admin",
      mustChangeCredentials: true,
      emailVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.email, DEFAULT_ADMIN_EMAIL));

  bootstrapped = true;
  console.log(`[bootstrap] default admin created: ${DEFAULT_ADMIN_EMAIL}`);
}
