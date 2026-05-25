/**
 * 通知策略集成测试。
 *
 * 验证：
 * - 订阅独立渠道：sub A → telegram、sub B → email，两组各自发送
 * - 模板渲染：notification_templates 存在时按 sub/channel/global 优先级选用
 * - 模板缺失时回退到旧的聚合英文格式（保持不破坏现有用户体验）
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import type { NotificationHit, Subscription } from "@qreminder/shared";
import { pickTemplate, buildChannelMessage } from "./notification-cron.js";

type TemplateRow = {
  id: string;
  user: string;
  scope: "global" | "channel" | "subscription";
  scopeId: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  createdAt: string;
  updatedAt: string;
};

function makeTemplate(
  scope: "global" | "channel" | "subscription",
  scopeId: string,
  titleTemplate: string,
  bodyTemplate: string,
): TemplateRow {
  const now = new Date().toISOString();
  return {
    id: `${scope}-${scopeId || "x"}`,
    user: "u1",
    scope,
    scopeId,
    titleTemplate,
    bodyTemplate,
    createdAt: now,
    updatedAt: now,
  };
}

function makeSub(overrides: Partial<Subscription>): Subscription {
  return {
    id: "sub-x",
    user: "u1",
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
    notes: "",
    tags: [],
    extra: {},
    reminderOffsets: [3],
    snoozedUntil: null,
    lastUsedAt: null,
    ...overrides,
  };
}

function makeHit(overrides: Partial<NotificationHit> = {}): NotificationHit {
  return {
    subscriptionId: "sub-x",
    subscriptionName: "Netflix",
    daysUntil: 3,
    matchedOffset: 3,
    kind: "renewal",
    ...overrides,
  };
}

describe("pickTemplate", () => {
  it("returns the subscription-scoped template when present", () => {
    const templates = [
      makeTemplate("global", "", "G:{{subscription.name}}", "global body"),
      makeTemplate("channel", "email", "C:{{subscription.name}}", "channel body"),
      makeTemplate("subscription", "sub-1", "S:{{subscription.name}}", "sub body"),
    ];
    const picked = pickTemplate(templates as never, "sub-1", "email");
    expect(picked?.scope).toBe("subscription");
  });

  it("falls back to channel-scoped when no subscription-scoped exists", () => {
    const templates = [
      makeTemplate("global", "", "G", "g"),
      makeTemplate("channel", "telegram", "C", "c"),
    ];
    const picked = pickTemplate(templates as never, "sub-1", "telegram");
    expect(picked?.scope).toBe("channel");
  });

  it("falls back to global when no scoped match exists", () => {
    const templates = [
      makeTemplate("global", "", "G", "g"),
      makeTemplate("channel", "telegram", "C", "c"),
    ];
    const picked = pickTemplate(templates as never, "sub-1", "email");
    expect(picked?.scope).toBe("global");
  });

  it("returns undefined when no template matches", () => {
    expect(pickTemplate([], "sub-1", "email")).toBeUndefined();
  });
});

describe("buildChannelMessage", () => {
  it("uses templates when available and renders variables", () => {
    const templates = [
      makeTemplate(
        "global",
        "",
        "{{subscription.name}} 续费提醒",
        "{{subscription.name}} 将在 {{daysLeft}} 天后续费，金额 {{subscription.currency}} {{subscription.amount}}",
      ),
    ];
    const groupedHits = [
      {
        hit: makeHit({ subscriptionId: "sub-1", subscriptionName: "Spotify" }),
        sub: makeSub({ id: "sub-1", name: "Spotify", price: 10, currency: "USD" }),
      },
    ];
    const msg = buildChannelMessage(groupedHits, ["email"], templates as never, "Alice");
    expect(msg.title).toBe("Spotify 续费提醒");
    expect(msg.body).toBe("Spotify 将在 3 天后续费，金额 USD 10");
  });

  it("aggregates multiple hits in body using the same template", () => {
    const templates = [
      makeTemplate("global", "", "{{subscription.name}}", "{{subscription.name}} - {{daysLeft}}d"),
    ];
    const groupedHits = [
      { hit: makeHit({ subscriptionId: "a", daysUntil: 1 }), sub: makeSub({ id: "a", name: "A" }) },
      { hit: makeHit({ subscriptionId: "b", daysUntil: 5 }), sub: makeSub({ id: "b", name: "B" }) },
    ];
    const msg = buildChannelMessage(groupedHits, ["email"], templates as never, "u");
    expect(msg.title).toBe("Qreminder · 2 reminders");
    expect(msg.body).toBe("A - 1d\n\nB - 5d");
  });

  it("falls back to legacy aggregated English when no templates exist", () => {
    const groupedHits = [
      { hit: makeHit({ subscriptionName: "A", daysUntil: 0 }), sub: makeSub({ name: "A" }) },
      { hit: makeHit({ subscriptionName: "B", daysUntil: 3, kind: "trial" }), sub: makeSub({ name: "B", status: "trial" }) },
    ];
    const msg = buildChannelMessage(groupedHits, ["email"], [], "u");
    expect(msg.title).toContain("1 trial ending");
    expect(msg.title).toContain("1 renewal");
    expect(msg.body).toContain("⚠️ Trial ending soon");
    expect(msg.body).toContain("• B — in 3 days");
    expect(msg.body).toContain("Upcoming renewals");
    expect(msg.body).toContain("• A — today");
  });

  it("prefers subscription-scoped over global when both exist", () => {
    const templates = [
      makeTemplate("global", "", "Global:{{subscription.name}}", "g"),
      makeTemplate("subscription", "sub-1", "Sub:{{subscription.name}}", "sub-body"),
    ];
    const groupedHits = [
      {
        hit: makeHit({ subscriptionId: "sub-1" }),
        sub: makeSub({ id: "sub-1", name: "X" }),
      },
    ];
    const msg = buildChannelMessage(groupedHits, ["email"], templates as never, "u");
    expect(msg.title).toBe("Sub:X");
    expect(msg.body).toBe("sub-body");
  });
});
