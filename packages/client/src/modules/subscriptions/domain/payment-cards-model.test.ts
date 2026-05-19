import { describe, expect, it } from "vitest";
import { DEFAULT_CUSTOM_CONFIG } from "@/types/config";
import type { Subscription } from "@/types/subscription";
import { assertDateOnly } from "@/lib/time/date-only";
import {
  UNSPECIFIED_PAYMENT_KEY,
  buildPaymentCardsModel,
} from "./payment-cards-model";

type FixedBillingCycle = Exclude<Subscription["billingCycle"], "custom">;
type SubscriptionBaseFixture = Omit<Subscription, "billingCycle" | "customDays">;
type SubscriptionOverrides = Partial<Omit<Subscription, "billingCycle" | "customDays">> & (
  | { billingCycle?: FixedBillingCycle; customDays?: undefined }
  | { billingCycle: "custom"; customDays?: number }
);

const convert = (amount: number, from: string, to: string) => {
  if (from === to) return amount;
  if (from === "USD" && to === "CNY") return amount * 7;
  if (from === "CNY" && to === "USD") return amount / 7;
  return amount;
};

function subscription(overrides: SubscriptionOverrides): Subscription {
  const base: SubscriptionBaseFixture = {
    id: "sub",
    name: "Service",
    logo: undefined,
    price: 10,
    currency: "USD",
    category: "productivity",
    status: "active",
    paymentMethod: undefined,
    startDate: assertDateOnly("2026-01-01"),
    nextBillingDate: assertDateOnly("2026-01-05"),
    autoCalculateNextBillingDate: true,
    trialEndDate: undefined,
    website: undefined,
    notes: undefined,
    tags: [],
    reminderOffsets: [3],
  };

  if (overrides.billingCycle === "custom") {
    return {
      ...base,
      ...overrides,
      billingCycle: "custom",
      customDays: overrides.customDays ?? 30,
    };
  }

  return {
    ...base,
    ...overrides,
    billingCycle: overrides.billingCycle ?? "monthly",
    customDays: undefined,
  };
}

describe("payment cards model", () => {
  it("groups active subscriptions by payment method and sorts by monthly cost", () => {
    const model = buildPaymentCardsModel({
      subscriptions: [
        subscription({ id: "a", price: 30, paymentMethod: "alipay" }),
        subscription({ id: "b", price: 20, paymentMethod: "alipay" }),
        subscription({ id: "c", price: 60, paymentMethod: "credit_card" }),
        subscription({ id: "d", price: 100, status: "cancelled", paymentMethod: "credit_card" }),
      ],
      config: DEFAULT_CUSTOM_CONFIG,
      defaultCurrency: "USD",
      convert,
    });

    expect(model.totalSubscriptions).toBe(3);
    expect(model.totalMonthly).toBe(110);
    expect(model.groups).toHaveLength(2);

    expect(model.groups[0]?.method?.value).toBe("credit_card");
    expect(model.groups[0]?.monthly).toBe(60);
    expect(model.groups[1]?.method?.value).toBe("alipay");
    expect(model.groups[1]?.monthly).toBe(50);
    expect(model.groups[1]?.subscriptions.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("places unspecified payment methods last regardless of cost", () => {
    const model = buildPaymentCardsModel({
      subscriptions: [
        subscription({ id: "big", price: 200, paymentMethod: undefined }),
        subscription({ id: "small", price: 10, paymentMethod: "alipay" }),
      ],
      config: DEFAULT_CUSTOM_CONFIG,
      defaultCurrency: "USD",
      convert,
    });

    expect(model.groups).toHaveLength(2);
    expect(model.groups[0]?.method?.value).toBe("alipay");
    expect(model.groups[1]?.key).toBe(UNSPECIFIED_PAYMENT_KEY);
    expect(model.groups[1]?.method).toBeNull();
  });

  it("calculates share of total in percent", () => {
    const model = buildPaymentCardsModel({
      subscriptions: [
        subscription({ id: "a", price: 75, paymentMethod: "credit_card" }),
        subscription({ id: "b", price: 25, paymentMethod: "alipay" }),
      ],
      config: DEFAULT_CUSTOM_CONFIG,
      defaultCurrency: "USD",
      convert,
    });

    expect(model.groups[0]?.shareOfTotalPercent).toBe(75);
    expect(model.groups[1]?.shareOfTotalPercent).toBe(25);
  });

  it("converts currency before monthly cycle normalization", () => {
    const model = buildPaymentCardsModel({
      subscriptions: [
        subscription({ id: "annualUSD", price: 12, currency: "USD", billingCycle: "annual", paymentMethod: "credit_card" }),
        subscription({ id: "monthlyCNY", price: 70, currency: "CNY", billingCycle: "monthly", paymentMethod: "alipay" }),
      ],
      config: DEFAULT_CUSTOM_CONFIG,
      defaultCurrency: "CNY",
      convert,
    });

    expect(model.totalMonthly).toBe(77);
    expect(model.groups[0]?.method?.value).toBe("alipay");
    expect(model.groups[1]?.method?.value).toBe("credit_card");
  });

  it("returns empty groups when only inactive subscriptions exist", () => {
    const model = buildPaymentCardsModel({
      subscriptions: [
        subscription({ id: "paused", status: "paused", paymentMethod: "alipay" }),
        subscription({ id: "cancelled", status: "cancelled", paymentMethod: "credit_card" }),
      ],
      config: DEFAULT_CUSTOM_CONFIG,
      defaultCurrency: "USD",
      convert,
    });

    expect(model.groups).toHaveLength(0);
    expect(model.totalMethods).toBe(0);
    expect(model.totalSubscriptions).toBe(0);
    expect(model.totalMonthly).toBe(0);
  });
});
