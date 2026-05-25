/**
 * 价格变更历史的写入与读取测试。
 *
 * 直接通过 drizzle 验证插入/查询契约 + 级联删除。
 * 不绕到 HTTP/Hono 层 —— 那部分由集成测试覆盖；这里聚焦数据语义。
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq, desc } from "drizzle-orm";
import { subscriptions, subscriptionPriceHistory } from "../db/schema.js";
import { createTestDb, seedUser, seedSubscription, type TestDb } from "../test-utils/db.js";

describe("subscription price history", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  async function logChange(
    userId: string,
    subId: string,
    oldPrice: number,
    newPrice: number,
    oldCurrency = "CNY",
    newCurrency = "CNY",
    changedAt = new Date().toISOString(),
  ) {
    await testDb.db.insert(subscriptionPriceHistory).values({
      id: crypto.randomUUID(),
      user: userId,
      subscriptionId: subId,
      oldPrice,
      newPrice,
      oldCurrency,
      newCurrency,
      changedAt,
    });
  }

  it("records entries in descending order of changedAt", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId);
    await logChange(userId, subId, 10, 12, "CNY", "CNY", "2026-01-01T00:00:00.000Z");
    await logChange(userId, subId, 12, 15, "CNY", "CNY", "2026-03-01T00:00:00.000Z");
    await logChange(userId, subId, 15, 14, "CNY", "CNY", "2026-05-01T00:00:00.000Z");

    const rows = await testDb.db
      .select()
      .from(subscriptionPriceHistory)
      .where(eq(subscriptionPriceHistory.subscriptionId, subId))
      .orderBy(desc(subscriptionPriceHistory.changedAt));

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.newPrice)).toEqual([14, 15, 12]);
  });

  it("cascade-deletes when the subscription is deleted", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId);
    await logChange(userId, subId, 10, 20);

    await testDb.db.delete(subscriptions).where(eq(subscriptions.id, subId));

    const rows = await testDb.db.select().from(subscriptionPriceHistory);
    expect(rows).toHaveLength(0);
  });

  it("preserves history rows for other subscriptions when one is deleted", async () => {
    const userId = await seedUser(testDb.db);
    const subA = await seedSubscription(testDb.db, userId, { id: "sub-a", name: "A" });
    const subB = await seedSubscription(testDb.db, userId, { id: "sub-b", name: "B" });
    await logChange(userId, subA, 10, 20);
    await logChange(userId, subB, 5, 6);

    await testDb.db.delete(subscriptions).where(eq(subscriptions.id, subA));

    const remaining = await testDb.db.select().from(subscriptionPriceHistory);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.subscriptionId).toBe(subB);
  });

  it("currency changes are recorded distinctly from pure price changes", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId);
    await logChange(userId, subId, 100, 100, "CNY", "USD");
    const [row] = await testDb.db.select().from(subscriptionPriceHistory);
    expect(row!.oldCurrency).toBe("CNY");
    expect(row!.newCurrency).toBe("USD");
    expect(row!.oldPrice).toBe(row!.newPrice);
  });
});
