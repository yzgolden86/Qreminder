/**
 * 测试用的内存 SQLite 数据库工厂。
 *
 * 用 better-sqlite3 + drizzle 在 :memory: 上跑迁移，每个 test 拿到一个隔离的 db
 * 实例。比 mock 强：测试的是真实 schema、真实 SQL 行为、真实 onDelete 约束。
 */
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import BetterSqlite3 from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as schema from "../db/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, "../../drizzle");

export interface TestDb {
  db: BetterSQLite3Database<typeof schema>;
  raw: BetterSqlite3.Database;
  close: () => void;
}

export function createTestDb(): TestDb {
  const raw = new BetterSqlite3(":memory:");
  raw.pragma("foreign_keys = ON");
  const db = drizzle(raw, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}

/** Seed a single user row so foreign-key constraints to users.id succeed. */
export async function seedUser(
  db: BetterSQLite3Database<typeof schema>,
  id = "test-user-1",
): Promise<string> {
  // users.createdAt/updatedAt are timestamp_ms mode columns — drizzle expects
  // Date instances and serializes via getTime() at write time.
  const now = new Date();
  await db.insert(schema.users).values({
    id,
    name: "Test User",
    email: `${id}@example.com`,
    emailVerified: true,
    role: "user",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Seed a subscription tied to a user. Returns its id. */
export async function seedSubscription(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
  overrides: Partial<typeof schema.subscriptions.$inferInsert> = {},
): Promise<string> {
  const now = new Date().toISOString();
  const id = overrides.id ?? `sub-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.subscriptions).values({
    id,
    user: userId,
    name: "Netflix",
    logo: "",
    price: 19.99,
    currency: "CNY",
    billingCycle: "monthly",
    customDays: null,
    category: "entertainment",
    status: "active",
    paymentMethod: "card",
    startDate: "2026-01-15",
    nextBillingDate: "2026-06-15",
    autoCalculateNextBillingDate: true,
    trialEndDate: null,
    website: null,
    notes: null,
    tags: [],
    extra: {},
    reminderDays: 3,
    reminderOffsets: [3],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return id;
}
