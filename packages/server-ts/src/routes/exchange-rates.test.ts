/**
 * 汇率中心测试：表约束、fetcher 落库、快照解析。
 *
 * - exchange_rates 表的唯一约束（date+base+from）
 * - fetchDailyExchangeRates 的 upsert / fallback 行为（mock fetch + 真实内存库）
 * - resolveRateSnapshot 的交叉汇率换算与 7 天回看窗口
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { exchangeRates } from "../db/schema.js";
import { createTestDb, type TestDb } from "../test-utils/db.js";
import { fetchDailyExchangeRates } from "../cron/exchange-rate-fetcher.js";
import { resolveRateSnapshot } from "../lib/rate-snapshot.js";
import type { Database } from "../db/types.js";

const originalFetch = global.fetch;

/** 插入一条 USD 基准汇率行的快捷方式。 */
async function seedRate(
  testDb: TestDb,
  fromCurrency: string,
  rate: number,
  date: string,
) {
  const now = new Date().toISOString();
  await testDb.db.insert(exchangeRates).values({
    id: crypto.randomUUID(),
    date,
    baseCurrency: "USD",
    fromCurrency,
    rate,
    provider: "floatrates",
    createdAt: now,
    updatedAt: now,
  });
}

describe("exchange_rates table invariants", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("enforces unique (date, base, from) constraint", async () => {
    await seedRate(testDb, "CNY", 7.25, "2026-07-26");
    await expect(seedRate(testDb, "CNY", 7.3, "2026-07-26")).rejects.toThrow();
  });

  it("allows same currency pair on different dates", async () => {
    await seedRate(testDb, "CNY", 7.24, "2026-07-25");
    await seedRate(testDb, "CNY", 7.25, "2026-07-26");

    const rows = await testDb.db
      .select()
      .from(exchangeRates)
      .where(
        and(eq(exchangeRates.baseCurrency, "USD"), eq(exchangeRates.fromCurrency, "CNY")),
      );
    expect(rows).toHaveLength(2);
  });
});

describe("fetchDailyExchangeRates against real db", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
    global.fetch = originalFetch;
  });

  it("inserts fetched rates into the table", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("floatrates")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cny: { inverseRate: 7.25, date: "2026-07-26 00:00:01" },
            eur: { inverseRate: 0.92, date: "2026-07-26 00:00:01" },
          }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    }) as typeof fetch;

    const result = await fetchDailyExchangeRates(testDb.db as unknown as Database, {
      date: "2026-07-26",
    });

    expect(result.fetched).toBe(2);
    expect(result.provider).toBe("floatrates");

    const rows = await testDb.db.select().from(exchangeRates);
    expect(rows).toHaveLength(2);
    const cnyRow = rows.find((r) => r.fromCurrency === "CNY");
    expect(cnyRow?.rate).toBe(7.25);
    expect(cnyRow?.baseCurrency).toBe("USD");
  });

  it("upserts (updates) an existing rate on re-fetch with force", async () => {
    await seedRate(testDb, "CNY", 7.1, "2026-07-26");

    global.fetch = vi.fn((url) => {
      if (String(url).includes("floatrates")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cny: { inverseRate: 7.25, date: "2026-07-26 00:00:01" },
          }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    }) as typeof fetch;

    const result = await fetchDailyExchangeRates(testDb.db as unknown as Database, {
      date: "2026-07-26",
      force: true,
    });

    expect(result.fetched).toBe(1);

    const rows = await testDb.db.select().from(exchangeRates);
    expect(rows).toHaveLength(1); // 更新而非新增
    expect(rows[0]?.rate).toBe(7.25);
    expect(rows[0]?.provider).toBe("floatrates");
  });

  it("returns errors from both providers on total failure without writing rows", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network down"))) as typeof fetch;

    const result = await fetchDailyExchangeRates(testDb.db as unknown as Database, {
      date: "2026-07-26",
    });

    expect(result.provider).toBeNull();
    expect(result.fetched).toBe(0);
    expect(result.errors.length).toBe(2);

    const rows = await testDb.db.select().from(exchangeRates);
    expect(rows).toHaveLength(0);
  });
});

describe("resolveRateSnapshot", () => {
  let testDb: TestDb;
  let db: Database;

  beforeEach(() => {
    testDb = createTestDb();
    db = testDb.db as unknown as Database;
  });

  afterEach(() => {
    testDb.close();
  });

  it("returns 1 for same currency", async () => {
    const snapshot = await resolveRateSnapshot(db, "CNY", "CNY", "2026-07-26");
    expect(snapshot).toEqual({ rate: 1, date: "2026-07-26" });
  });

  it("converts USD -> base directly", async () => {
    await seedRate(testDb, "CNY", 7.25, "2026-07-26");
    // 1 USD = 7.25 CNY
    const snapshot = await resolveRateSnapshot(db, "USD", "CNY", "2026-07-26");
    expect(snapshot?.rate).toBeCloseTo(7.25);
  });

  it("converts payment currency -> base via USD cross rate", async () => {
    await seedRate(testDb, "CNY", 7.25, "2026-07-26");
    await seedRate(testDb, "EUR", 0.92, "2026-07-26");
    // 1 EUR = 7.25 / 0.92 CNY ≈ 7.8804
    const snapshot = await resolveRateSnapshot(db, "EUR", "CNY", "2026-07-26");
    expect(snapshot?.rate).toBeCloseTo(7.25 / 0.92);
    expect(snapshot?.date).toBe("2026-07-26");
  });

  it("falls back to the most recent rate within 7 days", async () => {
    await seedRate(testDb, "CNY", 7.2, "2026-07-21");
    await seedRate(testDb, "EUR", 0.9, "2026-07-21");

    const snapshot = await resolveRateSnapshot(db, "EUR", "CNY", "2026-07-26");
    expect(snapshot?.rate).toBeCloseTo(7.2 / 0.9);
    expect(snapshot?.date).toBe("2026-07-21");
  });

  it("returns null when nearest rate is older than 7 days", async () => {
    await seedRate(testDb, "CNY", 7.2, "2026-07-10");
    await seedRate(testDb, "EUR", 0.9, "2026-07-10");

    const snapshot = await resolveRateSnapshot(db, "EUR", "CNY", "2026-07-26");
    expect(snapshot).toBeNull();
  });

  it("returns null when a leg of the cross rate is missing", async () => {
    await seedRate(testDb, "CNY", 7.25, "2026-07-26");
    // EUR 缺失
    const snapshot = await resolveRateSnapshot(db, "EUR", "CNY", "2026-07-26");
    expect(snapshot).toBeNull();
  });
});
