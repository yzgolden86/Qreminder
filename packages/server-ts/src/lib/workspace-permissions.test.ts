/**
 * 工作空间权限层级测试。
 *
 * 这里只测纯函数（roleAtLeast）+ DB 查询（getMembership）。
 * 中间件挂载到 Hono 路由的行为由 [[workspaces.test]] 端到端覆盖（待补，本期先验证基础原语）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { roleAtLeast, getMembership } from "../lib/workspace-permissions.js";
import { workspaces, workspaceMembers } from "../db/schema.js";
import { createTestDb, seedUser, type TestDb } from "../test-utils/db.js";

let testDb: TestDb | null = null;

afterEach(() => {
  testDb?.close();
  testDb = null;
});

describe("roleAtLeast", () => {
  it("owner satisfies any required role", () => {
    expect(roleAtLeast("owner", "owner")).toBe(true);
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("owner", "viewer")).toBe(true);
  });

  it("admin can do admin/editor/viewer but not owner-only", () => {
    expect(roleAtLeast("admin", "owner")).toBe(false);
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("admin", "editor")).toBe(true);
    expect(roleAtLeast("admin", "viewer")).toBe(true);
  });

  it("editor cannot perform admin actions", () => {
    expect(roleAtLeast("editor", "admin")).toBe(false);
    expect(roleAtLeast("editor", "editor")).toBe(true);
    expect(roleAtLeast("editor", "viewer")).toBe(true);
  });

  it("viewer is the lowest tier", () => {
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "admin")).toBe(false);
    expect(roleAtLeast("viewer", "owner")).toBe(false);
  });
});

describe("getMembership", () => {
  it("returns null for non-members", async () => {
    testDb = createTestDb();
    await seedUser(testDb.db, "u1");
    const now = new Date().toISOString();
    await testDb.db.insert(workspaces).values({
      id: "ws1",
      name: "Test WS",
      owner: "u1",
      createdAt: now,
      updatedAt: now,
    });
    const result = await getMembership(testDb.db, "ws1", "u2");
    expect(result).toBeNull();
  });

  it("returns membership row when user is a member", async () => {
    testDb = createTestDb();
    await seedUser(testDb.db, "u1");
    const now = new Date().toISOString();
    await testDb.db.insert(workspaces).values({
      id: "ws1",
      name: "Test WS",
      owner: "u1",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.db.insert(workspaceMembers).values({
      id: "m1",
      workspaceId: "ws1",
      userId: "u1",
      role: "owner",
      createdAt: now,
    });

    const result = await getMembership(testDb.db, "ws1", "u1");
    expect(result).toEqual({ id: "m1", role: "owner" });
  });

  it("returns null for the wrong workspace even if user is in another", async () => {
    testDb = createTestDb();
    await seedUser(testDb.db, "u1");
    const now = new Date().toISOString();
    await testDb.db.insert(workspaces).values([
      { id: "ws1", name: "A", owner: "u1", createdAt: now, updatedAt: now },
      { id: "ws2", name: "B", owner: "u1", createdAt: now, updatedAt: now },
    ]);
    await testDb.db.insert(workspaceMembers).values({
      id: "m1",
      workspaceId: "ws1",
      userId: "u1",
      role: "editor",
      createdAt: now,
    });

    const result = await getMembership(testDb.db, "ws2", "u1");
    expect(result).toBeNull();
  });
});
