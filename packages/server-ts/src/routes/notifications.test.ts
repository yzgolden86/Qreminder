import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationJobs, settings as settingsTable, workspaceMembers, workspaces } from "../db/schema.js";
import { createTestDb, seedSubscription, seedUser } from "../test-utils/db.js";
import {
  buildNotificationHistoryPayload,
  recordNotificationTestJob,
} from "./notification-history.js";
import { __testing__ } from "./notifications.js";

const { buildBarkTestUrl, fetchExternalUrl, validateExternalUrl } = __testing__;

describe("notification test URL safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the shared external URL rules for user-provided webhook URLs", () => {
    expect(validateExternalUrl("https://example.com/hook")).toMatchObject({
      ok: true,
      url: "https://example.com/hook",
    });
    expect(validateExternalUrl("http://localhost:3000/hook")).toMatchObject({
      ok: false,
      reason: "Private/internal hosts are not allowed",
    });
    expect(validateExternalUrl("http://[::ffff:127.0.0.1]/hook")).toMatchObject({
      ok: false,
      reason: "Private/internal hosts are not allowed",
    });
  });

  it("builds Bark test URLs from a validated public server base", () => {
    expect(buildBarkTestUrl("https://api.day.app", "device-key")).toBe(
      "https://api.day.app/device-key/Qreminder%20Test/If%20you%20see%20this%2C%20Bark%20is%20configured%20correctly.",
    );
    expect(() => buildBarkTestUrl("http://169.254.169.254", "device-key")).toThrow();
  });

  it("does not follow redirects for custom notification test URLs", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchExternalUrl("https://example.com/hook")).rejects.toThrow("redirects are not allowed");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});

describe("notification history payload", () => {
  it("normalizes legacy notification job results for the frontend contract", async () => {
    const testDb = createTestDb();
    try {
      const userId = await seedUser(testDb.db, "history-user");
      const workspaceId = "ws-history";
      const now = "2026-06-12T09:00:00.000Z";
      await testDb.db.insert(workspaces).values({
        id: workspaceId,
        name: "Personal",
        owner: userId,
        createdAt: now,
        updatedAt: now,
      });
      await testDb.db.insert(workspaceMembers).values({
        id: "member-history",
        workspaceId,
        userId,
        role: "owner",
        createdAt: now,
      });
      await testDb.db.insert(settingsTable).values({
        id: "settings-history",
        user: userId,
        workspaceId,
        settings: {
          timezone: "UTC",
          notificationTimeLocal: "09:00",
          enabledChannels: ["email"],
          showExpired: true,
        },
        createdAt: now,
        updatedAt: now,
      });
      await seedSubscription(testDb.db, userId, {
        id: "sub-history",
        workspaceId,
        name: "Netflix",
        nextBillingDate: "2026-06-15",
        reminderOffsets: [3],
      });
      await testDb.db.insert(notificationJobs).values({
        id: "job-history",
        user: userId,
        workspaceId,
        scheduledLocalDate: "2026-06-12",
        scheduledLocalTime: "09:00",
        timeZone: "UTC",
        scheduledInstantUtc: now,
        status: "failed",
        attempts: 1,
        lastError: "email: boom",
        result: {
          hits: [{
            subscriptionId: "sub-history",
            subscriptionName: "Netflix",
            daysUntil: 3,
            matchedOffset: 3,
            kind: "renewal",
          }],
          channelResults: [{ channel: "email", success: false, error: "boom" }],
        },
        createdAt: now,
        updatedAt: now,
      });

      const payload = await buildNotificationHistoryPayload(
        testDb.db,
        userId,
        workspaceId,
        { status: "all", limit: "20", offset: "0" },
        new Date(now),
      );

      expect(payload.upcoming[0]?.items[0]).toMatchObject({
        subscriptionId: "sub-history",
        name: "Netflix",
        type: "renewal",
        targetDate: "2026-06-15",
      });
      expect(payload.history.jobs[0]?.result).toMatchObject({
        source: "cron",
        channels: {
          attempted: ["email"],
          succeeded: [],
          failed: [{ channel: "email", error: "boom" }],
        },
      });
      expect(payload.summary.latestFailedJob?.id).toBe("job-history");
    } finally {
      testDb.close();
    }
  });

  it("records test notification attempts into notification history", async () => {
    const testDb = createTestDb();
    try {
      const userId = await seedUser(testDb.db, "test-log-user");
      const workspaceId = "ws-test-log";
      const now = "2026-06-12T09:23:10.000Z";
      await testDb.db.insert(workspaces).values({
        id: workspaceId,
        name: "Personal",
        owner: userId,
        createdAt: now,
        updatedAt: now,
      });
      await testDb.db.insert(workspaceMembers).values({
        id: "member-test-log",
        workspaceId,
        userId,
        role: "owner",
        createdAt: now,
      });

      await recordNotificationTestJob(testDb.db, {
        userId,
        workspaceId,
        channel: "email",
        settings: {
          timezone: "UTC",
          notificationTimeLocal: "09:00",
          enabledChannels: ["email"],
        },
        status: "sent",
        deliveryId: "mail-123",
        now: new Date(now),
      });
      await recordNotificationTestJob(testDb.db, {
        userId,
        workspaceId,
        channel: "email",
        settings: {
          timezone: "UTC",
          notificationTimeLocal: "09:00",
          enabledChannels: ["email"],
        },
        status: "failed",
        errorMessage: "SMTP rejected recipient(s): bad@example.com",
        now: new Date("2026-06-12T09:23:40.000Z"),
      });

      const rows = await testDb.db.select().from(notificationJobs);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "failed",
        attempts: 2,
        lastError: "SMTP rejected recipient(s): bad@example.com",
      });
    } finally {
      testDb.close();
    }
  });
});
