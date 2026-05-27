/**
 * 数据导出路由：JSON 和 CSV 格式。
 *
 * GET /api/export/json — 导出用户全部数据为 JSON
 * GET /api/export/subscriptions.csv — 导出订阅列表为 CSV
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { buildWorkspaceBackupArchive } from "../lib/backup-archive.js";
import type { AppEnv } from "../app.js";

export const exportRouter = new Hono<AppEnv>();

exportRouter.use("*", requireSession);

exportRouter.get("/json", async (c) => {
  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const workspaceId = c.get("workspaceId");

  const archive = await buildWorkspaceBackupArchive(db, userId, workspaceId, {
    version: "3.1.0",
    source: "json-export",
  });
  const files = unzipSync(archive);
  const metadata = readArchiveJson<Record<string, unknown>>(files, "metadata.json", {});

  const exportData = {
    app: "Qreminder",
    schemaVersion: 2,
    exportedAt: String(metadata["exportedAt"] ?? new Date().toISOString()),
    data: {
      subscriptions: readArchiveJson(files, "subscriptions.json", []),
      payments: readArchiveJson(files, "payments.json", []),
      settings: readArchiveJson(files, "settings.json", {}),
      customConfig: readArchiveJson(files, "custom-config.json", {}),
      budgets: readArchiveJson(files, "budgets.json", []),
      templates: readArchiveJson(files, "templates.json", []),
      notificationChannels: readArchiveJson(files, "notification-channels.json", []),
      priceHistory: readArchiveJson(files, "price-history.json", []),
    },
  };

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="qreminder-export.json"');
  return c.json(exportData);
});

exportRouter.get("/subscriptions.csv", async (c) => {
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");

  const userSubs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));

  const headers = [
    "name",
    "price",
    "currency",
    "billingCycle",
    "nextBillingDate",
    "startDate",
    "category",
    "status",
    "paymentMethod",
    "tags",
    "website",
    "notes",
  ];

  const rows = userSubs.map((s) => [
    csvEscape(s.name),
    String(s.price),
    s.currency,
    s.billingCycle,
    s.nextBillingDate,
    s.startDate,
    csvEscape(s.category),
    s.status,
    csvEscape(s.paymentMethod ?? ""),
    csvEscape((s.tags ?? []).join(";")),
    csvEscape(s.website ?? ""),
    csvEscape(s.notes ?? ""),
  ]);

  const bom = "﻿";
  const csv = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n";

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="qreminder-subscriptions.csv"');
  return c.body(csv);
});

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function readArchiveJson<T>(files: Record<string, Uint8Array>, name: string, fallback: T): T {
  const raw = files[name];
  if (!raw) return fallback;
  return JSON.parse(strFromU8(raw)) as T;
}
