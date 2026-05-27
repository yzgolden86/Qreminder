import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { eq } from "drizzle-orm";
import {
  budgets,
  customConfigs,
  notificationTemplates,
  settings,
  subscriptionNotificationChannels,
  subscriptionPayments,
  subscriptionPriceHistory,
  subscriptions,
  workspaceMembers,
  workspaces,
} from "../db/schema.js";
import { createTestDb, seedSubscription, seedUser, type TestDb } from "../test-utils/db.js";
import {
  buildWorkspaceBackupArchive,
  restoreWorkspaceBackupArchive,
} from "./backup-archive.js";

async function seedWorkspace(testDb: TestDb, userId: string, workspaceId: string) {
  const now = new Date().toISOString();
  await testDb.db.insert(workspaces).values({
    id: workspaceId,
    name: workspaceId,
    owner: userId,
    createdAt: now,
    updatedAt: now,
  });
  await testDb.db.insert(workspaceMembers).values({
    id: `member-${workspaceId}-${userId}`,
    workspaceId,
    userId,
    role: "owner",
    createdAt: now,
  });
}

describe("workspace backup archive", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("exports and restores settings, config, channel overrides, and price history", async () => {
    const sourceUser = await seedUser(testDb.db, "backup-source-user");
    const targetUser = await seedUser(testDb.db, "backup-target-user");
    await seedWorkspace(testDb, sourceUser, "ws-source");
    await seedWorkspace(testDb, targetUser, "ws-target");
    const now = new Date().toISOString();

    const sourceSubId = await seedSubscription(testDb.db, sourceUser, {
      id: "sub-source",
      workspaceId: "ws-source",
      name: "Pro Plan",
      price: 20,
      currency: "USD",
    });
    await testDb.db.insert(settings).values({
      id: "settings-source",
      user: sourceUser,
      workspaceId: "ws-source",
      settings: {
        timezone: "Asia/Shanghai",
        enabledChannels: ["email", "webhook"],
        webhookHeaders: "{\"Authorization\":\"Bearer SECRET\"}",
        icalToken: "SECRET-ICAL",
        webdavPassword: "SECRET-DAV",
        theme: "dark",
      },
      createdAt: now,
      updatedAt: now,
    });
    await testDb.db.insert(customConfigs).values({
      id: "config-source",
      user: sourceUser,
      workspaceId: "ws-source",
      config: { categories: ["AI"], paymentMethods: ["Visa"] },
      createdAt: now,
      updatedAt: now,
    });
    await testDb.db.insert(subscriptionPayments).values({
      id: "payment-source",
      user: sourceUser,
      workspaceId: "ws-source",
      subscriptionId: sourceSubId,
      subscriptionName: "Pro Plan",
      paidAt: "2026-05-01",
      amount: 20,
      currency: "USD",
      billingPeriod: "monthly",
      paymentMethod: "Visa",
      note: "initial",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.db.insert(budgets).values({
      id: "budget-source",
      user: sourceUser,
      workspaceId: "ws-source",
      scopeType: "category",
      scopeId: "AI",
      period: "monthly",
      amount: 100,
      currency: "USD",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await testDb.db.insert(notificationTemplates).values({
      id: "template-source",
      user: sourceUser,
      workspaceId: "ws-source",
      scope: "subscription",
      scopeId: sourceSubId,
      titleTemplate: "{{subscription.name}} due",
      bodyTemplate: "{{daysLeft}} days left",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.db.insert(subscriptionNotificationChannels).values({
      id: "channel-source",
      user: sourceUser,
      workspaceId: "ws-source",
      subscriptionId: sourceSubId,
      channel: "webhook",
      createdAt: now,
    });
    await testDb.db.insert(subscriptionPriceHistory).values({
      id: "history-source",
      user: sourceUser,
      workspaceId: "ws-source",
      subscriptionId: sourceSubId,
      oldPrice: 10,
      newPrice: 20,
      oldCurrency: "USD",
      newCurrency: "USD",
      changedAt: "2026-05-02T00:00:00.000Z",
    });

    const archive = await buildWorkspaceBackupArchive(testDb.db, sourceUser, "ws-source");
    const unzipped = unzipSync(archive);
    expect(unzipped["notification-channels.json"]).toBeDefined();
    expect(unzipped["price-history.json"]).toBeDefined();

    const exportedSettings = JSON.parse(strFromU8(unzipped["settings.json"]!));
    expect(exportedSettings.theme).toBe("dark");
    expect(exportedSettings.webhookHeaders).toBeUndefined();
    expect(exportedSettings.icalToken).toBeUndefined();
    expect(exportedSettings.webdavPassword).toBeUndefined();

    const imported = await restoreWorkspaceBackupArchive(testDb.db, targetUser, "ws-target", archive);

    expect(imported).toMatchObject({
      subscriptions: 1,
      payments: 1,
      budgets: 1,
      templates: 1,
      notificationChannels: 1,
      priceHistory: 1,
      settings: 1,
      customConfig: 1,
    });

    const [restoredSub] = await testDb.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, "ws-target"));
    expect(restoredSub?.name).toBe("Pro Plan");
    expect(restoredSub?.user).toBe(targetUser);

    const [restoredSettings] = await testDb.db
      .select()
      .from(settings)
      .where(eq(settings.workspaceId, "ws-target"));
    expect(restoredSettings?.settings).toMatchObject({
      timezone: "Asia/Shanghai",
      theme: "dark",
    });
    expect((restoredSettings?.settings as Record<string, unknown>)["webhookHeaders"]).toBeUndefined();

    const [restoredConfig] = await testDb.db
      .select()
      .from(customConfigs)
      .where(eq(customConfigs.workspaceId, "ws-target"));
    expect(restoredConfig?.config).toMatchObject({ categories: ["AI"], paymentMethods: ["Visa"] });

    const [restoredChannel] = await testDb.db
      .select()
      .from(subscriptionNotificationChannels)
      .where(eq(subscriptionNotificationChannels.workspaceId, "ws-target"));
    expect(restoredChannel?.subscriptionId).toBe(restoredSub?.id);
    expect(restoredChannel?.channel).toBe("webhook");

    const [restoredHistory] = await testDb.db
      .select()
      .from(subscriptionPriceHistory)
      .where(eq(subscriptionPriceHistory.workspaceId, "ws-target"));
    expect(restoredHistory?.subscriptionId).toBe(restoredSub?.id);
    expect(restoredHistory?.oldPrice).toBe(10);
    expect(restoredHistory?.newPrice).toBe(20);
  });

  it("rejects malformed optional files before writing any restore rows", async () => {
    const targetUser = await seedUser(testDb.db, "backup-malformed-target-user");
    await seedWorkspace(testDb, targetUser, "ws-malformed-target");
    const archive = zipSync({
      "metadata.json": strToU8(JSON.stringify({ app: "Qreminder", schemaVersion: 2 })),
      "subscriptions.json": strToU8(JSON.stringify([
        {
          id: "sub-from-bad-archive",
          name: "Should Not Import",
          price: 9,
          currency: "USD",
          billingCycle: "monthly",
          category: "AI",
          status: "active",
          startDate: "2026-01-01",
          nextBillingDate: "2026-06-01",
          autoCalculateNextBillingDate: true,
          reminderOffsets: [3],
        },
      ])),
      "payments.json": strToU8(JSON.stringify({ not: "an array" })),
    });

    await expect(
      restoreWorkspaceBackupArchive(testDb.db, targetUser, "ws-malformed-target", archive),
    ).rejects.toMatchObject({
      code: "invalid_backup",
    });

    const restoredSubs = await testDb.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, "ws-malformed-target"));
    expect(restoredSubs).toHaveLength(0);
  });
});
