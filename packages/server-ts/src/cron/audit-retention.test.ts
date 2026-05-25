/**
 * 审计日志保留清理器测试。
 *
 * 验证 retention cron 只删除超过保留期的条目，留下近期数据。
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { auditLogs } from "../db/schema.js";
import { createTestDb, seedUser, type TestDb } from "../test-utils/db.js";
import { runAuditRetention } from "./audit-retention.js";

describe("audit log retention", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  async function seedLog(id: string, userId: string, daysAgo: number, now: Date) {
    const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    await testDb.db.insert(auditLogs).values({
      id,
      userId,
      workspaceId: null,
      action: "test.action",
      targetType: "test",
      targetId: null,
      summary: "",
      metadata: {},
      createdAt: createdAt.toISOString(),
    });
  }

  it("deletes logs older than the retention window and keeps recent ones", async () => {
    const userId = await seedUser(testDb.db);
    const now = new Date("2026-05-24T12:00:00.000Z");

    await seedLog("ancient", userId, 365, now);
    await seedLog("just-past", userId, 181, now);
    await seedLog("on-boundary", userId, 180, now);
    await seedLog("recent", userId, 30, now);
    await seedLog("today", userId, 0, now);

    const result = await runAuditRetention(testDb.db, { now, retentionDays: 180 });

    expect(result.deletedCount).toBe(2);
    const remaining = await testDb.db.select().from(auditLogs);
    const ids = remaining.map((r) => r.id).sort();
    expect(ids).toEqual(["on-boundary", "recent", "today"]);
  });

  it("no-op when nothing exceeds the retention window", async () => {
    const userId = await seedUser(testDb.db);
    const now = new Date("2026-05-24T12:00:00.000Z");
    await seedLog("fresh", userId, 5, now);

    const result = await runAuditRetention(testDb.db, { now, retentionDays: 30 });

    expect(result.deletedCount).toBe(0);
    const remaining = await testDb.db.select().from(auditLogs);
    expect(remaining).toHaveLength(1);
  });

  it("custom retention window honored", async () => {
    const userId = await seedUser(testDb.db);
    const now = new Date("2026-05-24T12:00:00.000Z");
    await seedLog("a", userId, 10, now);
    await seedLog("b", userId, 60, now);

    const result = await runAuditRetention(testDb.db, { now, retentionDays: 30 });

    expect(result.deletedCount).toBe(1);
    expect(result.retentionDays).toBe(30);
    const remaining = await testDb.db.select().from(auditLogs);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe("a");
  });
});
