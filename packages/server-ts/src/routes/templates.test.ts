/**
 * 订阅模板测试：CRUD、从订阅另存为模板（含渠道继承）、使用计数。
 *
 * 用内存 SQLite + 真实迁移直接测数据层不变量；路由层的 workspace 隔离
 * 逻辑与其他路由一致（复用 requireActiveWorkspaceRole），这里重点测
 * 模板特有的行为。
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { subscriptionTemplates, subscriptionNotificationChannels } from "../db/schema.js";
import { createTestDb, seedUser, seedSubscription, type TestDb } from "../test-utils/db.js";

describe("subscription templates data invariants", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("stores template with json fields (tags, channels, offsets)", async () => {
    const userId = await seedUser(testDb.db);
    const now = new Date().toISOString();

    await testDb.db.insert(subscriptionTemplates).values({
      id: "tpl-1",
      user: userId,
      name: "AI 工具",
      category: "ai",
      tags: ["ai", "productivity"],
      defaultChannels: ["email", "telegram"],
      paymentMethod: "visa",
      billingCycle: "monthly",
      customDays: null,
      reminderOffsets: [7, 3, 1],
      notes: "",
      logoUrl: "",
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const [row] = await testDb.db
      .select()
      .from(subscriptionTemplates)
      .where(eq(subscriptionTemplates.id, "tpl-1"));

    expect(row?.tags).toEqual(["ai", "productivity"]);
    expect(row?.defaultChannels).toEqual(["email", "telegram"]);
    expect(row?.reminderOffsets).toEqual([7, 3, 1]);
    expect(row?.billingCycle).toBe("monthly");
  });

  it("captures subscription fields + notification channels when saving as template", async () => {
    const userId = await seedUser(testDb.db);
    const subId = await seedSubscription(testDb.db, userId, {
      name: "Claude Pro",
      category: "ai",
      tags: ["ai"],
      billingCycle: "monthly",
      paymentMethod: "mastercard",
      reminderOffsets: [7, 1],
      notes: "team plan",
    });
    const now = new Date().toISOString();

    // 订阅配置了独立通知渠道
    await testDb.db.insert(subscriptionNotificationChannels).values([
      { id: "ch-1", user: userId, subscriptionId: subId, channel: "serverchan", createdAt: now },
      { id: "ch-2", user: userId, subscriptionId: subId, channel: "email", createdAt: now },
    ]);

    // 模拟 from-subscription 端点的核心逻辑
    const channels = await testDb.db
      .select({ channel: subscriptionNotificationChannels.channel })
      .from(subscriptionNotificationChannels)
      .where(eq(subscriptionNotificationChannels.subscriptionId, subId));

    await testDb.db.insert(subscriptionTemplates).values({
      id: "tpl-from-sub",
      user: userId,
      name: "Claude Pro",
      category: "ai",
      tags: ["ai"],
      defaultChannels: channels.map((r) => r.channel),
      paymentMethod: "mastercard",
      billingCycle: "monthly",
      customDays: null,
      reminderOffsets: [7, 1],
      notes: "team plan",
      logoUrl: "",
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const [tpl] = await testDb.db
      .select()
      .from(subscriptionTemplates)
      .where(eq(subscriptionTemplates.id, "tpl-from-sub"));

    expect(tpl?.defaultChannels).toEqual(expect.arrayContaining(["serverchan", "email"]));
    expect(tpl?.category).toBe("ai");
    expect(tpl?.reminderOffsets).toEqual([7, 1]);
    expect(tpl?.notes).toBe("team plan");
  });

  it("usage count increments without touching other fields", async () => {
    const userId = await seedUser(testDb.db);
    const now = new Date().toISOString();
    await testDb.db.insert(subscriptionTemplates).values({
      id: "tpl-count",
      user: userId,
      name: "VPS",
      category: "infra",
      tags: [],
      defaultChannels: [],
      paymentMethod: "",
      billingCycle: "annual",
      customDays: null,
      reminderOffsets: [3],
      notes: "",
      logoUrl: "",
      usageCount: 5,
      createdAt: now,
      updatedAt: now,
    });

    await testDb.db
      .update(subscriptionTemplates)
      .set({ usageCount: 6 })
      .where(eq(subscriptionTemplates.id, "tpl-count"));

    const [row] = await testDb.db
      .select()
      .from(subscriptionTemplates)
      .where(eq(subscriptionTemplates.id, "tpl-count"));
    expect(row?.usageCount).toBe(6);
    expect(row?.name).toBe("VPS");
    expect(row?.billingCycle).toBe("annual");
  });
});
