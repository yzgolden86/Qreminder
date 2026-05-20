import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, sql, and } from "drizzle-orm";
import * as schema from "./db/schema.js";
import type { Database } from "./db/types.js";
import { hashPassword, verifyPassword } from "./auth/password-hash.js";

export const DEFAULT_ADMIN_EMAIL = "admin@qreminder.local";
export const DEFAULT_ADMIN_PASSWORD = "Qreminder@2026";

let bootstrapped = false;
let migrated = false;

// 仅迁移默认 admin 账号的旧 scrypt 密码。
// Why: Better Auth 1.6 默认用 scrypt(N=16384,r=16) 哈希密码；在 Workers 上纯 JS scrypt
// 会超过 CPU time limit，导致登录直接失败。我们把哈希算法换成 PBKDF2-SHA256，但既有
// scrypt 哈希无法被新 verify 识别。无法对未知密码做静默升级，只能把默认 admin 重置为
// 默认密码并强制改密；其他用户需要走"管理员重置密码"或"忘记密码"流程。
async function migrateLegacyAdminPassword(db: Database): Promise<void> {
  if (migrated) return;
  migrated = true;

  const rows = await db
    .select({
      accountId: schema.accounts.id,
      userId: schema.users.id,
      password: schema.accounts.password,
    })
    .from(schema.accounts)
    .innerJoin(schema.users, eq(schema.accounts.userId, schema.users.id))
    .where(
      and(
        eq(schema.users.email, DEFAULT_ADMIN_EMAIL),
        eq(schema.accounts.providerId, "credential"),
      ),
    );

  for (const row of rows) {
    if (!row.password) continue;
    if (row.password.startsWith("pbkdf2:")) continue;

    const newHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    await db
      .update(schema.accounts)
      .set({ password: newHash })
      .where(eq(schema.accounts.id, row.accountId));
    await db
      .update(schema.users)
      .set({ mustChangeCredentials: true, updatedAt: new Date() })
      .where(eq(schema.users.id, row.userId));

    console.warn(
      `[bootstrap] migrated legacy password hash for ${DEFAULT_ADMIN_EMAIL}; ` +
        `password reset to default + mustChangeCredentials=true`,
    );
  }
}

export async function ensureDefaultAdmin(db: Database, secret: string, baseURL: string): Promise<void> {
  if (bootstrapped) return;

  const rows = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
  const count = Number(rows[0]?.count ?? 0);
  if (count > 0) {
    await migrateLegacyAdminPassword(db);
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
    emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 8, password: { hash: hashPassword, verify: verifyPassword } },
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
