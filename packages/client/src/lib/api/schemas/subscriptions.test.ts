import { describe, expect, it } from "vitest";
import { subscriptionCreateBodySchema } from "./subscriptions";

const validSubscriptionCreateBody = {
  name: "Logo Test",
  logo: null,
  price: 0.83,
  currency: "CNY",
  billingCycle: "monthly",
  customDays: null,
  category: "productivity",
  status: "active",
  paymentMethod: null,
  startDate: "2026-05-15",
  nextBillingDate: "2026-06-15",
  autoCalculateNextBillingDate: true,
  trialEndDate: null,
  website: null,
  notes: null,
  tags: [],
  reminderOffsets: [3],
};

describe("subscription API schemas", () => {
  it("accepts private asset paths and normal URLs for subscription logos", () => {
    expect(subscriptionCreateBodySchema.safeParse({
      ...validSubscriptionCreateBody,
      logo: "/api/app/assets/2pbs0lgyypqhjoy",
    }).success).toBe(true);

    expect(subscriptionCreateBodySchema.safeParse({
      ...validSubscriptionCreateBody,
      logo: "https://example.com/logo.png",
    }).success).toBe(true);

    expect(subscriptionCreateBodySchema.safeParse({
      ...validSubscriptionCreateBody,
      logo: "data:image/png;base64,aGVsbG8=",
    }).success).toBe(true);
  });

  it("keeps website URLs strict while rejecting unrelated relative logo paths", () => {
    expect(subscriptionCreateBodySchema.safeParse({
      ...validSubscriptionCreateBody,
      website: "/api/app/assets/2pbs0lgyypqhjoy",
    }).success).toBe(false);

    expect(subscriptionCreateBodySchema.safeParse({
      ...validSubscriptionCreateBody,
      logo: "/other/assets/2pbs0lgyypqhjoy",
    }).success).toBe(false);
  });
});
