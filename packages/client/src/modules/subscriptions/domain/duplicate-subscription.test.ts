import { describe, expect, it } from "vitest";
import { assertDateOnly } from "@/lib/time/date-only";
import type { Subscription } from "@/types/subscription";
import { buildDuplicateDraft } from "./duplicate-subscription";

type SubscriptionOverrides = Partial<Omit<Subscription, "billingCycle" | "customDays">> & (
  | { billingCycle?: Exclude<Subscription["billingCycle"], "custom">; customDays?: undefined }
  | { billingCycle: "custom"; customDays?: number }
);

function subscription(overrides: SubscriptionOverrides = {}): Subscription {
  const base = {
    id: "sub-1",
    name: "ChatGPT Plus",
    logo: "https://example.com/logo.png",
    price: 20,
    currency: "USD",
    category: "ai_tools",
    status: "active" as const,
    paymentMethod: "credit_card",
    startDate: assertDateOnly("2026-01-31"),
    nextBillingDate: assertDateOnly("2026-02-28"),
    autoCalculateNextBillingDate: true,
    trialEndDate: undefined,
    website: "https://chat.openai.com",
    notes: "team account",
    tags: ["work", "ai"],
    reminderOffsets: [7, 3],
  };
  return { ...base, ...overrides } as Subscription;
}

const today = assertDateOnly("2026-10-19");

describe("buildDuplicateDraft", () => {
  it("copies business fields and appends the suffix", () => {
    const draft = buildDuplicateDraft(subscription(), { today, suffix: "（副本）" });

    expect(draft.name).toBe("ChatGPT Plus（副本）");
    expect(draft.price).toBe(20);
    expect(draft.currency).toBe("USD");
    expect(draft.category).toBe("ai_tools");
    expect(draft.status).toBe("active");
    expect(draft.paymentMethod).toBe("credit_card");
    expect(draft.logo).toBe("https://example.com/logo.png");
    expect(draft.website).toBe("https://chat.openai.com");
    expect(draft.notes).toBe("team account");
    expect(draft.tags).toEqual(["work", "ai"]);
    expect(draft.reminderOffsets).toEqual([7, 3]);
  });

  it("restarts the billing period from today instead of copying stale dates", () => {
    const draft = buildDuplicateDraft(subscription({ billingCycle: "monthly" }), {
      today,
      suffix: " (copy)",
    });

    expect(draft.startDate).toBe(today);
    expect(draft.nextBillingDate).toBe("2026-11-19");
  });

  it("keeps a custom cycle length when recalculating the next billing date", () => {
    const draft = buildDuplicateDraft(
      subscription({ billingCycle: "custom", customDays: 45 }),
      { today, suffix: " (copy)" },
    );

    expect(draft.billingCycle).toBe("custom");
    expect(draft.customDays).toBe(45);
    expect(draft.nextBillingDate).toBe("2026-12-03");
  });

  it("drops an expired trial end date but keeps a future one", () => {
    const expired = buildDuplicateDraft(
      subscription({ status: "trial", trialEndDate: assertDateOnly("2026-10-01") }),
      { today, suffix: " (copy)" },
    );
    const future = buildDuplicateDraft(
      subscription({ status: "trial", trialEndDate: assertDateOnly("2026-10-25") }),
      { today, suffix: " (copy)" },
    );

    expect(expired.trialEndDate).toBeUndefined();
    expect(future.trialEndDate).toBe("2026-10-25");
  });

  it("does not carry snooze or usage history to the copy", () => {
    const draft = buildDuplicateDraft(
      subscription({
        snoozedUntil: assertDateOnly("2026-10-30"),
        lastUsedAt: assertDateOnly("2026-10-01"),
      }),
      { today, suffix: " (copy)" },
    );

    expect(draft).not.toHaveProperty("snoozedUntil");
    expect(draft).not.toHaveProperty("lastUsedAt");
  });

  it("keeps the generated name within the 120 character limit", () => {
    const draft = buildDuplicateDraft(subscription({ name: "A".repeat(120) }), {
      today,
      suffix: "（副本）",
    });

    expect(draft.name).toHaveLength(120);
    expect(draft.name.endsWith("（副本）")).toBe(true);
  });

  it("copies arrays so editing the draft cannot mutate the source", () => {
    const source = subscription();
    const draft = buildDuplicateDraft(source, { today, suffix: " (copy)" });

    draft.tags.push("mutated");
    draft.reminderOffsets.push(1);

    expect(source.tags).toEqual(["work", "ai"]);
    expect(source.reminderOffsets).toEqual([7, 3]);
  });
});
