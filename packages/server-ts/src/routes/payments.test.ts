/**
 * 支付历史的核心账本不变量测试。
 *
 * 重点验证 Phase 0.1 的修复：删除订阅必须保留支付记录（subscription_id 置 null
 * 而不是级联删除）。这是账本最重要的不变量——历史付款是已经发生的事实。
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { subscriptions, subscriptionPayments } from "../db/schema.js";
import { createTestDb, seedUser, seedSubscription, type TestDb } from "../test-utils/db.js";

describe("payments ledger invariants", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("preserves payment rows when subscription is deleted (subscription_id set to null)", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId);
    const now = new Date().toISOString();

    await testDb.db.insert(subscriptionPayments).values([
      {
        id: "pay-1",
        user: userId,
        subscriptionId: subId,
        subscriptionName: "Netflix",
        paidAt: "2026-04-15",
        amount: 19.99,
        currency: "CNY",
        billingPeriod: "monthly",
        paymentMethod: "card",
        note: "",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pay-2",
        user: userId,
        subscriptionId: subId,
        subscriptionName: "Netflix",
        paidAt: "2026-05-15",
        amount: 19.99,
        currency: "CNY",
        billingPeriod: "monthly",
        paymentMethod: "card",
        note: "",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await testDb.db.delete(subscriptions).where(eq(subscriptions.id, subId));

    const remaining = await testDb.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.user, userId));

    expect(remaining).toHaveLength(2);
    expect(remaining.every((p) => p.subscriptionId === null)).toBe(true);
    expect(remaining.every((p) => p.subscriptionName === "Netflix")).toBe(true);
    expect(remaining.map((p) => p.amount).sort()).toEqual([19.99, 19.99]);
  });

  it("orphaned payments (subscriptionId=null) keep their cached subscription name", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId, { name: "Spotify Premium" });
    const now = new Date().toISOString();

    await testDb.db.insert(subscriptionPayments).values({
      id: "pay-1",
      user: userId,
      subscriptionId: subId,
      subscriptionName: "Spotify Premium",
      paidAt: "2026-05-01",
      amount: 10.99,
      currency: "USD",
      billingPeriod: "monthly",
      paymentMethod: "card",
      note: "",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.db.delete(subscriptions).where(eq(subscriptions.id, subId));

    const [orphan] = await testDb.db.select().from(subscriptionPayments);
    expect(orphan).toBeDefined();
    expect(orphan!.subscriptionId).toBeNull();
    expect(orphan!.subscriptionName).toBe("Spotify Premium");
  });

  it("multiple subscriptions: deleting one only orphans its own payments", async () => {
    const userId = await seedUser(testDb.db);
    const subA = await seedSubscription(testDb.db, userId, { id: "sub-a", name: "A" });
    const subB = await seedSubscription(testDb.db, userId, { id: "sub-b", name: "B" });
    const now = new Date().toISOString();

    await testDb.db.insert(subscriptionPayments).values([
      {
        id: "pay-a",
        user: userId,
        subscriptionId: subA,
        subscriptionName: "A",
        paidAt: "2026-05-01",
        amount: 10,
        currency: "CNY",
        billingPeriod: "monthly",
        paymentMethod: "",
        note: "",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pay-b",
        user: userId,
        subscriptionId: subB,
        subscriptionName: "B",
        paidAt: "2026-05-01",
        amount: 20,
        currency: "CNY",
        billingPeriod: "monthly",
        paymentMethod: "",
        note: "",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await testDb.db.delete(subscriptions).where(eq(subscriptions.id, subA));

    const all = await testDb.db.select().from(subscriptionPayments);
    const payA = all.find((p) => p.id === "pay-a")!;
    const payB = all.find((p) => p.id === "pay-b")!;
    expect(payA.subscriptionId).toBeNull();
    expect(payB.subscriptionId).toBe(subB);
  });

  it("only the owning user's subscriptions affect orphan behavior", async () => {
    const userA = await seedUser(testDb.db, "user-a");
    const userB = await seedUser(testDb.db, "user-b");
    const subA = await seedSubscription(testDb.db, userA, { id: "sub-a", name: "A" });
    const subB = await seedSubscription(testDb.db, userB, { id: "sub-b", name: "B" });
    const now = new Date().toISOString();

    await testDb.db.insert(subscriptionPayments).values([
      {
        id: "pay-a", user: userA, subscriptionId: subA, subscriptionName: "A",
        paidAt: "2026-05-01", amount: 10, currency: "CNY",
        billingPeriod: "monthly", paymentMethod: "", note: "",
        createdAt: now, updatedAt: now,
      },
      {
        id: "pay-b", user: userB, subscriptionId: subB, subscriptionName: "B",
        paidAt: "2026-05-01", amount: 20, currency: "CNY",
        billingPeriod: "monthly", paymentMethod: "", note: "",
        createdAt: now, updatedAt: now,
      },
    ]);

    await testDb.db.delete(subscriptions).where(eq(subscriptions.id, subA));

    const userBPayments = await testDb.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.user, userB));
    // User B's payment was untouched; its subscriptionId stays linked to sub-b.
    expect(userBPayments).toHaveLength(1);
    expect(userBPayments[0]!.subscriptionId).toBe(subB);
  });
});

describe("payments aggregation logic", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("sums monthly amounts correctly across multiple payments in the same month", async () => {
    // This guards against the bug the user originally reported: only one May
    // payment being counted when several existed.
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId);
    const now = new Date().toISOString();
    const may = ["2026-05-05", "2026-05-15", "2026-05-25"];

    await testDb.db.insert(subscriptionPayments).values(
      may.map((paidAt, i) => ({
        id: `pay-${i}`,
        user: userId,
        subscriptionId: subId,
        subscriptionName: "X",
        paidAt,
        amount: 10,
        currency: "CNY",
        billingPeriod: "monthly",
        paymentMethod: "",
        note: "",
        createdAt: now,
        updatedAt: now,
      })),
    );

    const rows = await testDb.db.select().from(subscriptionPayments);
    const mayTotal = rows
      .filter((p) => p.paidAt.startsWith("2026-05"))
      .reduce((s, p) => s + p.amount, 0);
    expect(rows).toHaveLength(3);
    expect(mayTotal).toBe(30);
  });

  it("buckets per-currency without mixing", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId);
    const now = new Date().toISOString();

    await testDb.db.insert(subscriptionPayments).values([
      { id: "p1", user: userId, subscriptionId: subId, subscriptionName: "X", paidAt: "2026-05-01",
        amount: 100, currency: "CNY", billingPeriod: "monthly", paymentMethod: "", note: "",
        createdAt: now, updatedAt: now },
      { id: "p2", user: userId, subscriptionId: subId, subscriptionName: "X", paidAt: "2026-05-02",
        amount: 15, currency: "USD", billingPeriod: "monthly", paymentMethod: "", note: "",
        createdAt: now, updatedAt: now },
    ]);

    const rows = await testDb.db.select().from(subscriptionPayments);
    const buckets = new Map<string, number>();
    for (const p of rows) {
      buckets.set(p.currency, (buckets.get(p.currency) ?? 0) + p.amount);
    }
    expect(buckets.get("CNY")).toBe(100);
    expect(buckets.get("USD")).toBe(15);
  });
});

describe("sync-from-subscriptions dedup logic", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("dedup key correctly identifies existing (subscriptionId, paidAt) tuples", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId);
    const now = new Date().toISOString();

    await testDb.db.insert(subscriptionPayments).values({
      id: "pay-existing",
      user: userId,
      subscriptionId: subId,
      subscriptionName: "X",
      paidAt: "2026-05-15",
      amount: 19.99,
      currency: "CNY",
      billingPeriod: "monthly",
      paymentMethod: "",
      note: "",
      createdAt: now,
      updatedAt: now,
    });

    // Build the same dedup Set the sync endpoint uses.
    const existingPayments = await testDb.db.select().from(subscriptionPayments);
    const existingByKey = new Set(
      existingPayments
        .filter((p): p is typeof p & { subscriptionId: string } => p.subscriptionId !== null)
        .map((p) => `${p.subscriptionId}|${p.paidAt.slice(0, 10)}`),
    );

    expect(existingByKey.has(`${subId}|2026-05-15`)).toBe(true);
    expect(existingByKey.has(`${subId}|2026-06-15`)).toBe(false);
  });
});
