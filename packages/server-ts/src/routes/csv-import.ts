/**
 * CSV 导入路由。
 *
 * POST /api/import/csv/preview — 解析 CSV 并预览
 * POST /api/import/csv/confirm — 确认导入
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const csvImportRouter = new Hono<AppEnv>();

csvImportRouter.use("*", requireSession);

interface CsvRow {
  [key: string]: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headerLine = lines[0]!.replace(/^﻿/, "");
  const headers = parseCsvLine(headerLine);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!.trim().toLowerCase()] = values[j]?.trim() ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "名称", "订阅名", "subscription"],
  price: ["price", "amount", "金额", "价格"],
  currency: ["currency", "币种", "货币"],
  billingcycle: ["billingcycle", "billing_cycle", "cycle", "周期", "计费周期"],
  nextbillingdate: ["nextbillingdate", "next_billing_date", "nextdate", "到期日", "下次扣费"],
  startdate: ["startdate", "start_date", "开始日期"],
  category: ["category", "分类", "类别"],
  status: ["status", "状态"],
  paymentmethod: ["paymentmethod", "payment_method", "付款方式", "支付方式"],
  tags: ["tags", "标签"],
  website: ["website", "url", "网站"],
  notes: ["notes", "note", "备注"],
};

function resolveField(headers: string[], targetField: string): string | null {
  const aliases = FIELD_ALIASES[targetField] ?? [targetField];
  for (const alias of aliases) {
    const found = headers.find((h) => h.toLowerCase() === alias.toLowerCase());
    if (found) return found.toLowerCase();
  }
  return null;
}

csvImportRouter.post("/csv/preview", async (c) => {
  const text = await c.req.text();
  if (!text.trim()) {
    return c.json({ error: "empty_file" }, 400);
  }

  const rows = parseCsv(text);
  if (rows.length === 0) {
    return c.json({ error: "no_data", message: "CSV has no data rows" }, 400);
  }

  const headers = Object.keys(rows[0]!);
  const fieldMapping: Record<string, string | null> = {};
  for (const target of Object.keys(FIELD_ALIASES)) {
    fieldMapping[target] = resolveField(headers, target);
  }

  const nameField = fieldMapping["name"];
  if (!nameField) {
    return c.json({ error: "missing_name", message: "Cannot find 'name' column" }, 400);
  }

  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const existingNames = new Set(
    (await db.select({ name: subscriptions.name }).from(subscriptions).where(eq(subscriptions.user, userId)))
      .map((s) => s.name.toLowerCase()),
  );

  let newCount = 0;
  let duplicateCount = 0;
  const preview = rows.slice(0, 20).map((row) => {
    const name = row[nameField] ?? "";
    const isDuplicate = existingNames.has(name.toLowerCase());
    if (isDuplicate) duplicateCount++;
    else newCount++;
    return { name, status: isDuplicate ? "duplicate" : "new" };
  });

  const totalNew = rows.filter((r) => !existingNames.has((r[nameField] ?? "").toLowerCase())).length;
  const totalDuplicate = rows.length - totalNew;

  return c.json({
    totalRows: rows.length,
    headers,
    fieldMapping,
    summary: { new: totalNew, duplicate: totalDuplicate },
    preview,
  });
});

csvImportRouter.post("/csv/confirm", async (c) => {
  const text = await c.req.text();
  if (!text.trim()) {
    return c.json({ error: "empty_file" }, 400);
  }

  const rows = parseCsv(text);
  if (rows.length === 0) {
    return c.json({ error: "no_data" }, 400);
  }

  const headers = Object.keys(rows[0]!);
  const fieldMapping: Record<string, string | null> = {};
  for (const target of Object.keys(FIELD_ALIASES)) {
    fieldMapping[target] = resolveField(headers, target);
  }

  const nameField = fieldMapping["name"];
  if (!nameField) {
    return c.json({ error: "missing_name" }, 400);
  }

  const db = c.get("deps").db;
  const userId = c.get("user").id;
  const now = new Date().toISOString();

  const existingNames = new Set(
    (await db.select({ name: subscriptions.name }).from(subscriptions).where(eq(subscriptions.user, userId)))
      .map((s) => s.name.toLowerCase()),
  );

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row[nameField] ?? "";
    if (!name || existingNames.has(name.toLowerCase())) {
      skipped++;
      continue;
    }

    const getValue = (field: string) => {
      const mapped = fieldMapping[field];
      return mapped ? (row[mapped] ?? "") : "";
    };

    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      user: userId,
      name,
      logo: "",
      price: parseFloat(getValue("price")) || 0,
      currency: getValue("currency") || "CNY",
      billingCycle: normalizeCycle(getValue("billingcycle")),
      customDays: null,
      category: getValue("category"),
      status: normalizeStatus(getValue("status")),
      paymentMethod: getValue("paymentmethod"),
      startDate: getValue("startdate") || now.slice(0, 10),
      nextBillingDate: getValue("nextbillingdate") || now.slice(0, 10),
      autoCalculateNextBillingDate: true,
      trialEndDate: null,
      website: getValue("website") || null,
      notes: getValue("notes"),
      tags: getValue("tags") ? getValue("tags").split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [],
      extra: {},
      reminderDays: 3,
      reminderOffsets: [3],
      createdAt: now,
      updatedAt: now,
    });
    imported++;
  }

  return c.json({ imported, skipped });
});

function normalizeCycle(value: string): "weekly" | "monthly" | "quarterly" | "semi-annual" | "annual" | "custom" {
  const map: Record<string, string> = {
    weekly: "weekly", "每周": "weekly", week: "weekly",
    monthly: "monthly", "每月": "monthly", month: "monthly",
    quarterly: "quarterly", "每季": "quarterly", quarter: "quarterly",
    "semi-annual": "semi-annual", "半年": "semi-annual",
    annual: "annual", yearly: "annual", "每年": "annual", year: "annual",
    custom: "custom",
  };
  return (map[value.toLowerCase()] ?? "monthly") as ReturnType<typeof normalizeCycle>;
}

function normalizeStatus(value: string): "trial" | "active" | "paused" | "cancelled" {
  const map: Record<string, string> = {
    trial: "trial", "试用": "trial",
    active: "active", "活跃": "active", "启用": "active",
    paused: "paused", "暂停": "paused",
    cancelled: "cancelled", canceled: "cancelled", "已取消": "cancelled",
  };
  return (map[value.toLowerCase()] ?? "active") as ReturnType<typeof normalizeStatus>;
}
