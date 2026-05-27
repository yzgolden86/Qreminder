/**
 * iCal 日历订阅公开端点。
 *
 * GET /api/ical/:token — 无需登录，通过 token 鉴权。
 * 返回 text/calendar 格式的 VCALENDAR，包含用户活跃订阅的续费事件。
 */
import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { settings, subscriptions } from "../db/schema.js";
import type { AppEnv } from "../app.js";

export const icalRouter = new Hono<AppEnv>();

icalRouter.get("/:token", async (c) => {
  const token = c.req.param("token");
  if (!token || token.length < 16) {
    return c.text("Not Found", 404);
  }

  const db = c.get("deps").db;

  const [settingsRow] = await db
    .select()
    .from(settings)
    .where(sql`json_extract(${settings.settings}, '$.icalToken') = ${token}`);

  if (!settingsRow) {
    return c.text("Not Found", 404);
  }

  const userSettings = (settingsRow.settings ?? {}) as Record<string, unknown>;

  if (userSettings["icalEnabled"] === false) {
    return c.text("Not Found", 404);
  }

  const userSubs = await db
    .select()
    .from(subscriptions)
    .where(
      settingsRow.workspaceId
        ? eq(subscriptions.workspaceId, settingsRow.workspaceId)
        : and(eq(subscriptions.user, settingsRow.user), sql`${subscriptions.workspaceId} IS NULL`),
    );

  const activeSubs = userSubs.filter(
    (s) => s.status === "active" || s.status === "trial",
  );

  const includeAmount = userSettings["icalIncludeAmount"] !== false;
  const calName = "Qreminder";

  const events = activeSubs.map((sub) => buildEvent(sub, includeAmount));
  const ics = buildCalendar(calName, events);

  c.header("Content-Type", "text/calendar; charset=utf-8");
  c.header("Content-Disposition", 'inline; filename="qreminder.ics"');
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  return c.body(ics);
});

interface IcsEvent {
  uid: string;
  dtstart: string;
  summary: string;
  description: string;
}

function buildEvent(
  sub: typeof subscriptions.$inferSelect,
  includeAmount: boolean,
): IcsEvent {
  const lines: string[] = [];
  if (includeAmount) {
    lines.push(`金额: ${sub.currency} ${sub.price}`);
  }
  lines.push(`周期: ${sub.billingCycle}`);
  if (sub.category) lines.push(`分类: ${sub.category}`);
  if (sub.paymentMethod) lines.push(`付款方式: ${sub.paymentMethod}`);
  if (sub.website) lines.push(`网站: ${sub.website}`);

  return {
    uid: `${sub.id}@qreminder`,
    dtstart: sub.nextBillingDate.replace(/-/g, ""),
    summary: `${sub.name} 续费提醒`,
    description: lines.join("\\n"),
  };
}

function buildCalendar(calName: string, events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Qreminder//Subscription Calendar//EN",
    `X-WR-CALNAME:${calName}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTART;VALUE=DATE:${event.dtstart}`,
      `SUMMARY:${escapeIcs(event.summary)}`,
      `DESCRIPTION:${escapeIcs(event.description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
