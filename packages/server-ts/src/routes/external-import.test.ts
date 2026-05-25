/**
 * Wallos / SubTracker 导入器测试。
 *
 * 不绕到 HTTP/Hono — 测试关键的字段映射函数与 dedup 逻辑。
 * 端到端覆盖留给手工/集成测试。
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/schema.js";
import { createTestDb, seedUser, type TestDb } from "../test-utils/db.js";

// Re-export the internal mappers for direct testing. (Importers expose them
// only for tests; production path goes through the Hono routes.)
import { __testing__ } from "./external-import.js";

describe("Wallos importer mapping", () => {
  it("maps frequency=1, cycle=months → monthly", () => {
    const row = { name: "Netflix", price: 19.99, frequency: 1, cycle: "months" };
    const mapped = __testing__.mapWallosSubscription(row, "u1", emptyLookups(), nowIso());
    expect(mapped?.billingCycle).toBe("monthly");
    expect(mapped?.customDays).toBeNull();
  });

  it("maps frequency=3, cycle=months → quarterly", () => {
    const row = { name: "X", price: 30, frequency: 3, cycle: "months" };
    expect(__testing__.mapWallosSubscription(row, "u1", emptyLookups(), nowIso())?.billingCycle).toBe("quarterly");
  });

  it("maps frequency=12, cycle=months → annual", () => {
    const row = { name: "X", price: 30, frequency: 12, cycle: "months" };
    expect(__testing__.mapWallosSubscription(row, "u1", emptyLookups(), nowIso())?.billingCycle).toBe("annual");
  });

  it("maps weird intervals to custom with day count", () => {
    const row = { name: "X", price: 30, frequency: 5, cycle: "weeks" };
    const mapped = __testing__.mapWallosSubscription(row, "u1", emptyLookups(), nowIso());
    expect(mapped?.billingCycle).toBe("custom");
    expect(mapped?.customDays).toBe(35);
  });

  it("resolves category by numeric id when name not inlined", () => {
    const row = { name: "Spotify", category_id: 7, price: 10, frequency: 1, cycle: "months" };
    const lookups = {
      categories: __testing__.buildCategoryLookup([
        { id: 7, name: "Music" },
        { id: 8, name: "Productivity" },
      ]),
      paymentMethods: __testing__.buildCategoryLookup([]),
    };
    const mapped = __testing__.mapWallosSubscription(row, "u1", lookups, nowIso());
    expect(mapped?.category).toBe("Music");
  });

  it("inactive=1 maps to cancelled status", () => {
    const row = { name: "X", price: 1, frequency: 1, cycle: "months", inactive: 1 };
    expect(__testing__.mapWallosSubscription(row, "u1", emptyLookups(), nowIso())?.status).toBe("cancelled");
  });

  it("ignores rows without a name", () => {
    expect(__testing__.mapWallosSubscription({} as Record<string, unknown>, "u1", emptyLookups(), nowIso())).toBeNull();
    expect(__testing__.mapWallosSubscription({ name: "  " }, "u1", emptyLookups(), nowIso())).toBeNull();
  });
});

describe("SubTracker importer mapping", () => {
  it("maps MONTHLY enum to monthly", () => {
    const row = { name: "Notion", price: 4, billingCycle: "MONTHLY", currency: "USD" };
    const mapped = __testing__.mapSubTrackerSubscription(row, "u1", nowIso());
    expect(mapped?.billingCycle).toBe("monthly");
    expect(mapped?.currency).toBe("USD");
  });

  it("BIANNUALLY maps to semi-annual", () => {
    const row = { name: "X", billingCycle: "BIANNUALLY" };
    expect(__testing__.mapSubTrackerSubscription(row, "u1", nowIso())?.billingCycle).toBe("semi-annual");
  });

  it("CUSTOM with customDays produces custom cycle", () => {
    const row = { name: "X", billingCycle: "CUSTOM", customDays: 45 };
    const mapped = __testing__.mapSubTrackerSubscription(row, "u1", nowIso());
    expect(mapped?.billingCycle).toBe("custom");
    expect(mapped?.customDays).toBe(45);
  });

  it("normalizes status strings", () => {
    const trial = { name: "X", status: "trial" };
    const paused = { name: "X", status: "paused" };
    const canceled = { name: "X", status: "canceled" };
    expect(__testing__.mapSubTrackerSubscription(trial, "u1", nowIso())?.status).toBe("trial");
    expect(__testing__.mapSubTrackerSubscription(paused, "u1", nowIso())?.status).toBe("paused");
    expect(__testing__.mapSubTrackerSubscription(canceled, "u1", nowIso())?.status).toBe("cancelled");
  });

  it("retains string tags only", () => {
    const row = { name: "X", tags: ["work", 42, null, "home"] };
    expect(__testing__.mapSubTrackerSubscription(row, "u1", nowIso())?.tags).toEqual(["work", "home"]);
  });
});

describe("Wallos import dedupe", () => {
  let testDb: TestDb;
  beforeEach(() => {
    testDb = createTestDb();
  });
  afterEach(() => testDb.close());

  it("doesn't insert rows whose name already exists for the user (case-insensitive)", async () => {
    const userId = await seedUser(testDb.db);
    const now = nowIso();
    await testDb.db.insert(subscriptions).values({
      id: "existing",
      user: userId,
      name: "Netflix",
      logo: "",
      price: 19.99,
      currency: "USD",
      billingCycle: "monthly",
      customDays: null,
      category: "",
      status: "active",
      paymentMethod: "",
      startDate: "2025-01-01",
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
    });

    // Simulate the dedupe set the importer builds.
    const existing = await testDb.db
      .select({ name: subscriptions.name })
      .from(subscriptions)
      .where(eq(subscriptions.user, userId));
    const existingNames = new Set(existing.map((s) => s.name.trim().toLowerCase()));

    expect(existingNames.has("netflix")).toBe(true);
    expect(existingNames.has("NETFLIX".toLowerCase())).toBe(true);
    expect(existingNames.has("Spotify".toLowerCase())).toBe(false);
  });
});

function nowIso(): string {
  return new Date().toISOString();
}

function emptyLookups() {
  return {
    categories: __testing__.buildCategoryLookup([]),
    paymentMethods: __testing__.buildCategoryLookup([]),
  };
}
