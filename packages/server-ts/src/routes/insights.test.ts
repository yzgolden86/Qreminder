/**
 * Insights 启发式测试 — 重复检测 + 取消建议。
 *
 * 纯函数测试，不依赖 DB。
 */
import { describe, it, expect } from "vitest";
import { detectDuplicates, __testing__ as dupTesting } from "./insights-duplicates.js";
import { suggestCancellations, __testing__ as cancelTesting } from "./insights-cancel.js";
import type { InferSelectModel } from "drizzle-orm";
import type { subscriptions } from "../db/schema.js";

type SubscriptionRow = InferSelectModel<typeof subscriptions>;

function makeSub(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "s1",
    user: "u1",
    workspaceId: null,
    name: "Sample",
    logo: "",
    price: 10,
    currency: "USD",
    billingCycle: "monthly",
    customDays: null,
    category: "productivity",
    status: "active",
    paymentMethod: "",
    startDate: "2026-01-01",
    nextBillingDate: "2026-06-01",
    autoCalculateNextBillingDate: true,
    trialEndDate: null,
    website: "",
    notes: "",
    tags: [],
    extra: {},
    reminderDays: 3,
    reminderOffsets: [3],
    snoozedUntil: null,
    lastUsedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("strips tier suffixes", () => {
    expect(dupTesting.normalizeName("Notion Pro")).toBe("notion");
    expect(dupTesting.normalizeName("Spotify Premium")).toBe("spotify");
    expect(dupTesting.normalizeName("Disney+")).toBe("disney");
  });

  it("falls back to original tokens when only suffixes remain", () => {
    expect(dupTesting.normalizeName("Premium")).toBe("premium");
  });

  it("strips diacritics", () => {
    expect(dupTesting.normalizeName("Café Pro")).toBe("cafe");
  });

  it("preserves CJK characters", () => {
    expect(dupTesting.normalizeName("网易云音乐 会员")).toContain("网易云音乐");
  });
});

describe("detectDuplicates", () => {
  it("returns empty for fewer than 2 active subs", () => {
    expect(detectDuplicates([])).toEqual([]);
    expect(detectDuplicates([makeSub({})])).toEqual([]);
  });

  it("ignores cancelled / paused subs", () => {
    const groups = detectDuplicates([
      makeSub({ id: "a", name: "Netflix", status: "cancelled" }),
      makeSub({ id: "b", name: "Netflix", status: "active" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("detects same-name duplicates", () => {
    const groups = detectDuplicates([
      makeSub({ id: "a", name: "Netflix", price: 9.99 }),
      makeSub({ id: "b", name: "netflix pro", price: 15.99 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("same-name");
    expect(groups[0]!.members).toHaveLength(2);
    // sorted by price desc
    expect(groups[0]!.members[0]!.id).toBe("b");
  });

  it("detects similar-name + same-category duplicates", () => {
    const groups = detectDuplicates([
      makeSub({ id: "a", name: "GitHub Copilot Individual", category: "dev" }),
      makeSub({ id: "b", name: "GitHub Copilot Business", category: "dev" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("similar-name");
  });

  it("does NOT flag similar names in different categories", () => {
    const groups = detectDuplicates([
      makeSub({ id: "a", name: "Sport Plus", category: "media" }),
      makeSub({ id: "b", name: "Sport Tracker", category: "fitness" }),
    ]);
    expect(groups).toEqual([]);
  });

  it("falls back to same-category-price soft hint", () => {
    const groups = detectDuplicates([
      makeSub({ id: "a", name: "AAA", category: "media", price: 10, currency: "USD" }),
      makeSub({ id: "b", name: "BBB", category: "media", price: 11, currency: "USD" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("same-category-price");
  });

  it("does not double-count: subs claimed by stronger signals don't appear in weaker ones", () => {
    const groups = detectDuplicates([
      makeSub({ id: "a", name: "Netflix", category: "media", price: 10 }),
      makeSub({ id: "b", name: "Netflix", category: "media", price: 11 }),
      makeSub({ id: "c", name: "Disney", category: "media", price: 10 }),
      makeSub({ id: "d", name: "Hulu", category: "media", price: 11 }),
    ]);
    // a/b is same-name; c/d is same-category-price; a/b should NOT appear in pass 3.
    const sameName = groups.find((g) => g.reason === "same-name");
    const samePrice = groups.find((g) => g.reason === "same-category-price");
    expect(sameName?.members.map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(samePrice?.members.map((m) => m.id).sort()).toEqual(["c", "d"]);
  });
});

describe("monthlyEquivalent", () => {
  it("normalizes annual to monthly", () => {
    expect(cancelTesting.monthlyEquivalent(makeSub({ price: 120, billingCycle: "annual" }))).toBeCloseTo(10);
  });

  it("normalizes weekly to monthly", () => {
    expect(cancelTesting.monthlyEquivalent(makeSub({ price: 10, billingCycle: "weekly" }))).toBeCloseTo(43.3, 0);
  });

  it("uses customDays for custom cycle", () => {
    expect(cancelTesting.monthlyEquivalent(makeSub({ price: 60, billingCycle: "custom", customDays: 60 }))).toBeCloseTo(30);
  });
});

describe("suggestCancellations", () => {
  it("returns empty when no active subs", () => {
    expect(suggestCancellations([])).toEqual([]);
    expect(suggestCancellations([makeSub({ status: "cancelled" })])).toEqual([]);
  });

  it("flags stale subscriptions (lastUsedAt > 60 days ago)", () => {
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = suggestCancellations([
      makeSub({ id: "a", lastUsedAt: oldDate }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.reasons).toContain("insights.cancel.stale");
    expect(result[0]!.context.daysSinceLastUse).toBeGreaterThanOrEqual(60);
  });

  it("flags high-price subs", () => {
    const result = suggestCancellations([
      makeSub({ id: "a", price: 50, billingCycle: "monthly" }),
    ]);
    expect(result[0]!.reasons).toContain("insights.cancel.highPrice");
    expect(result[0]!.context.monthlyEquivalentPrice).toBe(50);
  });

  it("flags overdue trial", () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = suggestCancellations([
      makeSub({ id: "a", trialEndDate: past, status: "trial" }),
    ]);
    expect(result[0]!.reasons).toContain("insights.cancel.trialOver");
    expect(result[0]!.context.trialOverdueDays).toBeGreaterThan(0);
  });

  it("flags when a much cheaper alternative exists in same category", () => {
    const result = suggestCancellations([
      makeSub({ id: "expensive", name: "Pro Tool", category: "dev", price: 100 }),
      makeSub({ id: "cheap", name: "Cheap Tool", category: "dev", price: 10 }),
    ]);
    const expensive = result.find((r) => r.subscriptionId === "expensive");
    expect(expensive?.reasons).toContain("insights.cancel.cheaperAlternative");
    expect(expensive?.context.cheaperAlternativeId).toBe("cheap");
  });

  it("does NOT flag the cheapest sub in its own category as having a cheaper alternative", () => {
    const result = suggestCancellations([
      makeSub({ id: "expensive", name: "Pro Tool", category: "dev", price: 100 }),
      makeSub({ id: "cheap", name: "Cheap Tool", category: "dev", price: 10 }),
    ]);
    const cheap = result.find((r) => r.subscriptionId === "cheap");
    // cheap may or may not be in results (e.g., from other signals), but if present
    // shouldn't have cheaperAlternative reason
    if (cheap) expect(cheap.reasons).not.toContain("insights.cancel.cheaperAlternative");
  });

  it("confidence increases with more signals", () => {
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = suggestCancellations([
      // 2 signals: stale + highPrice
      makeSub({ id: "a", price: 50, lastUsedAt: oldDate }),
      // 1 signal: stale only
      makeSub({ id: "b", price: 5, lastUsedAt: oldDate, category: "" }),
    ]);
    const a = result.find((r) => r.subscriptionId === "a")!;
    const b = result.find((r) => r.subscriptionId === "b")!;
    expect(a.confidence).toBeGreaterThan(b.confidence);
  });

  it("sorts by confidence desc, then monthly cost desc", () => {
    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = suggestCancellations([
      makeSub({ id: "low", price: 5, lastUsedAt: oldDate, category: "" }),
      makeSub({ id: "high", price: 50, lastUsedAt: oldDate, category: "" }),
    ]);
    expect(result[0]!.subscriptionId).toBe("high");
  });
});
