/**
 * 通知策略集成测试。
 *
 * 验证：
 * - 订阅独立渠道：sub A → telegram、sub B → email，两组各自发送
 * - 模板渲染：notification_templates 存在时按 sub/channel/global 优先级选用
 * - 模板缺失时回退到更完整的默认提醒内容
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import type { NotificationHit, Subscription } from "@qreminder/shared";
import { eq } from "drizzle-orm";
import { notificationJobs, settings as settingsTable, workspaceMembers, workspaces } from "../db/schema.js";
import { createTestDb, seedSubscription, seedUser, type TestDb } from "../test-utils/db.js";
import type { MailerAdapter, MailMessage } from "../adapters/mailer.js";
import { pickTemplate, buildChannelMessage, runNotificationCron } from "./notification-cron.js";

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
        "{{subscription.name}} 将在 {{daysLeft}} 天后续费，金额 {{subscription.currency}} {{subscription.amount}}，入口 {{subscription.website}}",
      ),
    ];
    const groupedHits = [
      {
        hit: makeHit({ subscriptionId: "sub-1", subscriptionName: "Spotify" }),
        sub: makeSub({ id: "sub-1", name: "Spotify", price: 10, currency: "USD", website: "spotify.com" }),
      },
    ];
    const msg = buildChannelMessage(groupedHits, ["email"], templates as never, "Alice");
    expect(msg.title).toBe("Spotify 续费提醒");
    expect(msg.body).toBe("Spotify 将在 3 天后续费，金额 USD 10，入口 spotify.com");
    expect(msg.html).toContain("Spotify 续费提醒");
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

  it("builds an actionable default message when no templates exist", () => {
    const groupedHits = [
      {
        hit: makeHit({ subscriptionId: "a", subscriptionName: "Netflix", daysUntil: 0 }),
        sub: makeSub({
          id: "a",
          name: "Netflix",
          price: 19.99,
          currency: "USD",
          category: "Streaming",
          paymentMethod: "Visa",
          website: "netflix.com",
        }),
      },
      {
        hit: makeHit({ subscriptionId: "b", subscriptionName: "Notion", daysUntil: 3, kind: "trial" }),
        sub: makeSub({
          id: "b",
          name: "Notion",
          status: "trial",
          trialEndDate: "2026-06-18",
          website: null,
        }),
      },
    ];
    const msg = buildChannelMessage(groupedHits, ["email"], [], "u");
    expect(msg.title).toBe("Qreminder · 1 个续费，1 个试用到期待处理");
    expect(msg.body).toContain("你有 2 个订阅提醒需要关注。");
    expect(msg.body).toContain("类型: 订阅续费");
    expect(msg.body).toContain("时间: 今天 (2026-06-15)");
    expect(msg.body).toContain("金额: USD 19.99");
    expect(msg.body).toContain("分类: Streaming");
    expect(msg.body).toContain("支付方式: Visa");
    expect(msg.body).toContain("访问: https://netflix.com/");
    expect(msg.body).toContain("类型: 试用到期");
    expect(msg.body).toContain("时间: 3 天后 (2026-06-18)");
    expect(msg.html).toContain("访问订阅网站");
    expect(msg.html).toContain("href=\"https://netflix.com/\"");
    expect(msg.html).not.toContain("href=\"\"");
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

describe("runNotificationCron workspace scoping", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates independent jobs for the same user across workspaces", async () => {
    const userId = await seedUser(testDb.db, "cron-workspace-user");
    const now = "2026-06-12T09:00:00.000Z";
    const workspacesToSeed = [
      { id: "ws-cron-a", name: "Workspace A", subId: "sub-cron-a" },
      { id: "ws-cron-b", name: "Workspace B", subId: "sub-cron-b" },
    ];

    for (const workspace of workspacesToSeed) {
      await testDb.db.insert(workspaces).values({
        id: workspace.id,
        name: workspace.name,
        owner: userId,
        createdAt: now,
        updatedAt: now,
      });
      await testDb.db.insert(workspaceMembers).values({
        id: `member-${workspace.id}`,
        workspaceId: workspace.id,
        userId,
        role: "owner",
        createdAt: now,
      });
      await testDb.db.insert(settingsTable).values({
        id: `settings-${workspace.id}`,
        user: userId,
        workspaceId: workspace.id,
        settings: {
          timezone: "UTC",
          notificationTimeLocal: "09:00",
          enabledChannels: ["email"],
        },
        createdAt: now,
        updatedAt: now,
      });
      await seedSubscription(testDb.db, userId, {
        id: workspace.subId,
        workspaceId: workspace.id,
        name: workspace.name,
        nextBillingDate: "2026-06-15",
        reminderOffsets: [3],
      });
    }

    const sent: MailMessage[] = [];
    const mailer: MailerAdapter = {
      async send(message) {
        sent.push(message);
        return { id: `mail-${sent.length}` };
      },
    };

    const result = await runNotificationCron(
      { db: testDb.db, mailer },
      { now: new Date(now), force: true },
    );

    expect(result.sent).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent.map((msg) => msg.text).join("\n")).toContain("Workspace A");
    expect(sent.map((msg) => msg.text).join("\n")).toContain("Workspace B");

    const jobs = await testDb.db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.user, userId));
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job) => job.workspaceId))).toEqual(new Set(["ws-cron-a", "ws-cron-b"]));
  });
});
