/**
 * 自动备份测试。
 *
 * 用 in-memory BackupStore mock 验证：
 * - 备份 key 按日期命名
 * - ZIP 中包含所有关键 JSON 文件
 * - 敏感凭证从 settings 中剔除
 * - 超过 retention 的旧备份被清理
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { settings as settingsTable } from "../db/schema.js";
import { createTestDb, seedUser, seedSubscription, type TestDb } from "../test-utils/db.js";
import { runAutoBackup, type BackupStore } from "./auto-backup.js";

class MemoryBackupStore implements BackupStore {
  files = new Map<string, Uint8Array>();
  async putBackup(key: string, body: Uint8Array) {
    this.files.set(key, body);
  }
  async listBackupKeys(prefix: string) {
    return [...this.files.keys()].filter((k) => k.startsWith(prefix));
  }
  async deleteBackup(key: string) {
    this.files.delete(key);
  }
}

describe("auto-backup cron", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("writes a dated ZIP containing all key tables", async () => {
    const userId = await seedUser(testDb.db);
    await seedSubscription(testDb.db, userId);
    const store = new MemoryBackupStore();
    const now = new Date("2026-05-24T03:00:00.000Z");

    const result = await runAutoBackup(testDb.db, store, { now });

    expect(result.key).toBe("backups/auto/qreminder-2026-05-24.zip");
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.rowCounts["subscriptions"]).toBe(1);

    const archive = store.files.get(result.key)!;
    const unzipped = unzipSync(archive);
    expect(unzipped["metadata.json"]).toBeDefined();
    expect(unzipped["subscriptions.json"]).toBeDefined();
    expect(unzipped["payments.json"]).toBeDefined();
    expect(unzipped["budgets.json"]).toBeDefined();
    expect(unzipped["templates.json"]).toBeDefined();
    expect(unzipped["settings.json"]).toBeDefined();
    expect(unzipped["price-history.json"]).toBeDefined();
  });

  it("strips sensitive webhook keys from settings", async () => {
    const userId = await seedUser(testDb.db);
    const now = new Date();
    await testDb.db.insert(settingsTable).values({
      id: "s1",
      user: userId,
      settings: {
        timezone: "Asia/Shanghai",
        telegramBotToken: "SECRET-TG",
        smtpPassword: "SECRET-SMTP",
        notifyxApiKey: "SECRET-NX",
        otherField: "kept",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    const store = new MemoryBackupStore();

    const result = await runAutoBackup(testDb.db, store);
    const archive = store.files.get(result.key)!;
    const settingsFile = JSON.parse(strFromU8(unzipSync(archive)["settings.json"]!));

    expect(settingsFile).toHaveLength(1);
    const settings = settingsFile[0].settings;
    expect(settings.timezone).toBe("Asia/Shanghai");
    expect(settings.otherField).toBe("kept");
    expect(settings.telegramBotToken).toBeUndefined();
    expect(settings.smtpPassword).toBeUndefined();
    expect(settings.notifyxApiKey).toBeUndefined();
  });

  it("rotates backups older than the retention window", async () => {
    const userId = await seedUser(testDb.db);
    await seedSubscription(testDb.db, userId);
    const store = new MemoryBackupStore();
    const prefix = "backups/auto/";

    // Pre-seed older keys representing past backups.
    store.files.set(`${prefix}qreminder-2026-03-01.zip`, new Uint8Array(8));
    store.files.set(`${prefix}qreminder-2026-04-01.zip`, new Uint8Array(8));
    store.files.set(`${prefix}qreminder-2026-04-25.zip`, new Uint8Array(8));
    // Non-matching key should not be touched.
    store.files.set(`${prefix}other-thing.txt`, new Uint8Array(4));

    const now = new Date("2026-05-24T03:00:00.000Z");
    const result = await runAutoBackup(testDb.db, store, { now, retentionDays: 30 });

    // 30-day cutoff from 2026-05-24 is 2026-04-24 — anything strictly older
    // than that date should be rotated.
    expect(result.deletedOldBackups).toBe(2);
    expect(store.files.has(`${prefix}qreminder-2026-03-01.zip`)).toBe(false);
    expect(store.files.has(`${prefix}qreminder-2026-04-01.zip`)).toBe(false);
    expect(store.files.has(`${prefix}qreminder-2026-04-25.zip`)).toBe(true);
    expect(store.files.has(`${prefix}other-thing.txt`)).toBe(true);
    expect(store.files.has(result.key)).toBe(true);
  });

  it("works with empty database (no rows)", async () => {
    const store = new MemoryBackupStore();
    const result = await runAutoBackup(testDb.db, store);

    expect(result.rowCounts["users"]).toBe(0);
    expect(result.rowCounts["subscriptions"]).toBe(0);
    const archive = store.files.get(result.key)!;
    const unzipped = unzipSync(archive);
    expect(JSON.parse(strFromU8(unzipped["subscriptions.json"]!))).toEqual([]);
  });
});
