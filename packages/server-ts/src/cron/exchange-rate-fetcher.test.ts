import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { fetchDailyExchangeRates } from "./exchange-rate-fetcher.js";
import type { Database } from "../db/types.js";
import { exchangeRates } from "../db/schema.js";

// Mock fetch globally
const originalFetch = global.fetch;

describe("fetchDailyExchangeRates", () => {
  let mockDb: Database;
  let existingRates: Array<{ id: string; currency: string }>;
  let insertedRates: Array<{ id: string; date: string; baseCurrency: string; fromCurrency: string; rate: number; provider: string }>;
  let updatedRates: Array<{ id: string; rate: number; provider: string }>;

  beforeEach(() => {
    existingRates = [];
    insertedRates = [];
    updatedRates = [];

    mockDb = {
      select: vi.fn((fields) => ({
        from: vi.fn((table) => ({
          where: vi.fn((condition) => {
            // First where call: checking if rates exist for today
            // Second+ where calls: checking if specific currency rate exists
            return {
              limit: vi.fn((n) => Promise.resolve(existingRates)),
              then: (resolve: any) => resolve(existingRates), // For await without .limit()
            };
          }),
        })),
      })),
      insert: vi.fn((table) => ({
        values: vi.fn((values) => {
          insertedRates.push(values);
          return Promise.resolve();
        }),
      })),
      update: vi.fn((table) => ({
        set: vi.fn((values) => ({
          where: vi.fn((condition) => {
            updatedRates.push({ id: "existing-id", ...values });
            return Promise.resolve();
          }),
        })),
      })),
    } as unknown as Database;

    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should skip fetch if all rates already exist for today", async () => {
    // Simulate 29 existing rates (matching TARGET_CURRENCIES length)
    existingRates = Array.from({ length: 29 }, (_, i) => ({
      id: `rate-${i}`,
      currency: `CUR${i}`,
    }));

    const result = await fetchDailyExchangeRates(mockDb, { date: "2025-01-15" });

    expect(result.skipped).toBe(29);
    expect(result.fetched).toBe(0);
    expect(insertedRates).toHaveLength(0);
  });

  it("should fetch from floatrates (default provider) and insert rates", async () => {
    existingRates = [];

    global.fetch = vi.fn((url) => {
      if (typeof url === "string" && url.includes("floatrates")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cny: { inverseRate: 7.25, date: "2025-01-15 00:00:01" },
            eur: { inverseRate: 0.92, date: "2025-01-15 00:00:01" },
            jpy: { inverseRate: 157.5, date: "2025-01-15 00:00:01" },
          }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const result = await fetchDailyExchangeRates(mockDb, { date: "2025-01-15" });

    expect(result.provider).toBe("floatrates");
    expect(result.fetched).toBe(3);
    expect(result.failed).toBe(0);
    expect(insertedRates).toHaveLength(3);
    expect(insertedRates[0]).toMatchObject({
      baseCurrency: "USD",
      fromCurrency: "CNY",
      rate: 7.25,
      provider: "floatrates",
    });
  });

  it("should fallback to frankfurter if floatrates fails", async () => {
    existingRates = [];

    global.fetch = vi.fn((url) => {
      if (typeof url === "string" && url.includes("floatrates")) {
        return Promise.reject(new Error("FloatRates timeout"));
      }
      if (typeof url === "string" && url.includes("frankfurter")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { base: "USD", quote: "CNY", rate: 7.30, date: "2025-01-15" },
            { base: "USD", quote: "EUR", rate: 0.93, date: "2025-01-15" },
          ],
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const result = await fetchDailyExchangeRates(mockDb, { date: "2025-01-15" });

    expect(result.provider).toBe("frankfurter");
    expect(result.fetched).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("floatrates");
  });

  it("should return failed result if both providers fail", async () => {
    existingRates = [];

    global.fetch = vi.fn(() => Promise.reject(new Error("Network error")));

    const result = await fetchDailyExchangeRates(mockDb, { date: "2025-01-15" });

    expect(result.provider).toBeNull();
    expect(result.fetched).toBe(0);
    expect(result.failed).toBe(29); // TARGET_CURRENCIES.length
    expect(result.errors).toHaveLength(2); // floatrates + frankfurter
  });

  it("should update existing rate if force=true", async () => {
    existingRates = [{ id: "existing-rate-1", currency: "CNY" }];

    global.fetch = vi.fn((url) => {
      if (typeof url === "string" && url.includes("floatrates")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            cny: { inverseRate: 7.35, date: "2025-01-15 00:00:01" },
          }),
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const result = await fetchDailyExchangeRates(mockDb, {
      date: "2025-01-15",
      force: true,
    });

    expect(result.fetched).toBe(1);
    expect(updatedRates).toHaveLength(1);
    expect(updatedRates[0]).toMatchObject({
      rate: 7.35,
      provider: "floatrates",
    });
  });

  it("should handle frankfurter as preferred provider", async () => {
    existingRates = [];

    global.fetch = vi.fn((url) => {
      if (typeof url === "string" && url.includes("frankfurter")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { base: "USD", quote: "GBP", rate: 0.79, date: "2025-01-15" },
          ],
        } as Response);
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const result = await fetchDailyExchangeRates(mockDb, {
      date: "2025-01-15",
      preferredProvider: "frankfurter",
    });

    expect(result.provider).toBe("frankfurter");
    expect(result.fetched).toBe(1);
    expect(insertedRates[0]?.fromCurrency).toBe("GBP");
  });
});
