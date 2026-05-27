import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { auditLogs, workspaceMembers, workspaces } from "../db/schema.js";
import { createTestDb, seedUser, type TestDb } from "../test-utils/db.js";
import { subscriptionsRouter } from "./subscriptions.js";
import type { AppDeps, AppEnv } from "../app.js";

const workspaceId = "ws-subscription-audit";

async function seedWorkspace(testDb: TestDb, userId: string) {
  const now = new Date().toISOString();
  await testDb.db.insert(workspaces).values({
    id: workspaceId,
    name: "Audit Workspace",
    owner: userId,
    createdAt: now,
    updatedAt: now,
  });
  await testDb.db.insert(workspaceMembers).values({
    id: "member-subscription-audit",
    workspaceId,
    userId,
    role: "editor",
    createdAt: now,
  });
}

function createRouteHarness(testDb: TestDb, userId: string) {
  const app = new Hono<AppEnv>();
  const deps = {
    db: testDb.db,
    storage: {
      put: async () => ({ key: "unused", mimeType: "image/png", sizeBytes: 0, originalName: "unused" }),
      get: async () => null,
      delete: async () => {},
    },
    mailer: {
      send: async () => ({ id: "unused" }),
    },
    scheduler: { kind: "node-cron" },
    auth: { secret: "test-secret", baseURL: "http://localhost", trustedOrigins: [] },
  } satisfies AppDeps;

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    c.set("workspaceId", workspaceId);
    c.set("workspaceRole", "editor");
    c.set("auth", {
      api: {
        getSession: async () => ({
          session: { id: "session-1" },
          user: { id: userId, email: `${userId}@example.com`, name: "Test User", role: "user" },
        }),
      },
    } as unknown as AppEnv["Variables"]["auth"]);
    await next();
  });
  app.route("/", subscriptionsRouter);
  return app;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

describe("subscription audit logging", () => {
  let testDb: TestDb;
  let userId: string;
  let app: Hono<AppEnv>;

  beforeEach(async () => {
    testDb = createTestDb();
    userId = await seedUser(testDb.db, "subscription-audit-user");
    await seedWorkspace(testDb, userId);
    app = createRouteHarness(testDb, userId);
  });

  afterEach(() => {
    testDb.close();
  });

  it("records workspace-scoped audit entries for subscription mutations", async () => {
    const draft = {
      name: "Notion",
      logo: null,
      price: 10,
      currency: "USD",
      billingCycle: "monthly",
      customDays: null,
      category: "productivity",
      status: "active",
      paymentMethod: null,
      startDate: "2026-01-01",
      nextBillingDate: "2026-06-01",
      autoCalculateNextBillingDate: true,
      trialEndDate: null,
      website: null,
      notes: null,
      tags: [],
      reminderOffsets: [3],
    };

    const createRes = await app.request("/", jsonRequest("POST", draft));
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { subscription: { id: string } };
    const subscriptionId = created.subscription.id;

    const updateRes = await app.request(`/${subscriptionId}`, jsonRequest("PATCH", { price: 12 }));
    expect(updateRes.status).toBe(200);
    const snoozeRes = await app.request(`/${subscriptionId}/snooze`, jsonRequest("POST", { days: 7 }));
    expect(snoozeRes.status).toBe(200);
    const usageRes = await app.request(`/${subscriptionId}/track-usage`, jsonRequest("POST"));
    expect(usageRes.status).toBe(200);
    const deleteRes = await app.request(`/${subscriptionId}`, jsonRequest("DELETE"));
    expect(deleteRes.status).toBe(200);

    const rows = await testDb.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId));
    const byAction = new Map(rows.map((row) => [row.action, row]));

    expect([...byAction.keys()].sort()).toEqual([
      "subscription.create",
      "subscription.delete",
      "subscription.snooze",
      "subscription.trackUsage",
      "subscription.update",
    ]);
    expect(byAction.get("subscription.create")?.metadata).toMatchObject({
      category: "productivity",
      status: "active",
      billingCycle: "monthly",
    });
    expect(byAction.get("subscription.update")?.metadata).toMatchObject({
      fields: ["price"],
      priceChanged: true,
    });
    expect(byAction.get("subscription.snooze")?.metadata).toMatchObject({ days: 7 });
    expect(byAction.get("subscription.trackUsage")?.metadata).toHaveProperty("lastUsedAt");
    expect(rows.every((row) => row.userId === userId && row.targetId === subscriptionId)).toBe(true);
  });
});
