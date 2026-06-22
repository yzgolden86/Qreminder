import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { notificationJobs } from "../db/schema.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import { assertExternalHttpUrl, ExternalUrlError } from "../lib/external-url.js";
import { assertValidEmailRecipients, parseEmailRecipients } from "../lib/email-recipients.js";
import {
  buildNotificationHistoryPayload,
  recordNotificationTestJob,
} from "./notification-history.js";
import type { AppEnv } from "../app.js";

export const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.use("*", requireSession);

notificationsRouter.get("/history", async (c) => {
  const db = c.get("deps").db;
  const userId = (c.get("user") as { id: string }).id;
  const workspaceId = c.get("workspaceId");
  const payload = await buildNotificationHistoryPayload(db, userId, workspaceId, {
    status: c.req.query("status"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  return c.json(payload);
});

// GET /notifications/recent-failures?days=7 — surface failed notification jobs
// so the UI can show a badge / drill-down list. We return summarized rows
// (no internal job state like cron's scheduledInstantUtc), enough for the
// header badge + a "what failed and why" list.
notificationsRouter.get("/recent-failures", async (c) => {
  const db = c.get("deps").db;
  const userId = (c.get("user") as { id: string }).id;
  const workspaceId = c.get("workspaceId");
  const daysParam = Number.parseInt(c.req.query("days") ?? "7", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 7;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const rows = await db
    .select()
    .from(notificationJobs)
    .where(
      and(
        eq(notificationJobs.user, userId),
        eq(notificationJobs.workspaceId, workspaceId),
        eq(notificationJobs.status, "failed"),
      ),
    )
    .orderBy(desc(notificationJobs.scheduledLocalDate));

  // Filter by cutoff after the SQL query because notificationJobs has no
  // index on scheduledLocalDate and the result set is small per user.
  const recent = rows.filter((r) => r.scheduledLocalDate >= cutoffDate);

  return c.json({
    count: recent.length,
    failures: recent.slice(0, 50).map((r) => ({
      id: r.id,
      scheduledLocalDate: r.scheduledLocalDate,
      scheduledLocalTime: r.scheduledLocalTime,
      timeZone: r.timeZone,
      attempts: r.attempts,
      lastError: r.lastError,
      workspaceId: r.workspaceId,
    })),
  });
});

function validateExternalUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  try {
    return { ok: true, url: assertExternalHttpUrl(raw).toString() };
  } catch (err) {
    return { ok: false, reason: externalUrlErrorMessage(err) };
  }
}

async function fetchExternalUrl(raw: string, init: RequestInit = {}): Promise<Response> {
  const url = assertExternalHttpUrl(raw).toString();
  const res = await fetch(url, { ...init, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new Error("External URL redirects are not allowed");
  }
  return res;
}

function buildBarkTestUrl(serverUrl: string, deviceKey: string): string {
  const url = assertExternalHttpUrl(serverUrl.trim() || "https://api.day.app");
  const basePath = url.pathname.replace(/\/+$/, "");
  const segments = [
    deviceKey,
    "Qreminder Test",
    "If you see this, Bark is configured correctly.",
  ].map(encodeURIComponent);
  url.pathname = `${basePath}/${segments.join("/")}`;
  return url.toString();
}

function externalUrlErrorMessage(err: unknown): string {
  return err instanceof ExternalUrlError || err instanceof Error ? err.message : "Invalid URL";
}

const testSchema = z.object({
  channel: z.enum(["telegram", "notifyx", "webhook", "wechat", "email", "bark", "serverchan"]),
  settings: z.record(z.string(), z.unknown()),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

class NotificationTestError extends Error {
  code: string;
  status: 400;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NotificationTestError";
    this.code = code;
    this.status = 400;
  }
}

function failTest(code: string, message: string): never {
  throw new NotificationTestError(code, message);
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

notificationsRouter.post("/test", requireActiveWorkspaceRole("editor"), async (c) => {
  const user = c.get("user") as { id: string; email: string };
  const userId = user.id;
  const db = c.get("deps").db;
  const workspaceId = c.get("workspaceId");
  if (!checkRateLimit(userId)) {
    return c.json({ error: "rate_limited", message: "Too many test requests, please wait a moment" }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body" }, 400);
  }

  const { channel, settings } = parsed.data;
  let deliveryId = "";

  try {
    switch (channel) {
      case "telegram": {
        const token = String(settings["telegramBotToken"] ?? "").trim();
        const chatId = String(settings["telegramChatId"] ?? "").trim();
        if (!token || !chatId) {
          failTest("missing_config", "Bot Token and Chat ID are required");
        }
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "✅ Qreminder test notification\n\nIf you see this message, your Telegram channel is configured correctly.",
            parse_mode: "Markdown",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ description: "Unknown error" }));
          failTest("telegram_error", (err as { description?: string }).description ?? "Send failed");
        }
        break;
      }

      case "bark": {
        const serverUrl = String(settings["barkServerUrl"] ?? "https://api.day.app").trim();
        const deviceKey = String(settings["barkDeviceKey"] ?? "").trim();
        if (!deviceKey) {
          failTest("missing_config", "Device Key is required");
        }
        let barkTarget: string;
        try {
          barkTarget = buildBarkTestUrl(serverUrl, deviceKey);
        } catch (err) {
          failTest("invalid_url", externalUrlErrorMessage(err));
        }
        const res = await fetchExternalUrl(barkTarget);
        if (!res.ok) {
          failTest("bark_error", `HTTP ${res.status}`);
        }
        break;
      }

      case "webhook": {
        const webhookUrl = String(settings["webhookUrl"] ?? "").trim();
        const method = String(settings["webhookMethod"] ?? "POST").trim();
        if (!webhookUrl) {
          failTest("missing_config", "Webhook URL is required");
        }
        const webhookCheck = validateExternalUrl(webhookUrl);
        if (!webhookCheck.ok) {
          failTest("invalid_url", webhookCheck.reason);
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const rawHeaders = String(settings["webhookHeaders"] ?? "").trim();
        if (rawHeaders) {
          try {
            Object.assign(headers, JSON.parse(rawHeaders));
          } catch { /* ignore invalid headers */ }
        }
        const payload = JSON.stringify({ event: "test", message: "Qreminder test notification" });
        const res = await fetchExternalUrl(webhookCheck.url, {
          method,
          headers,
          ...(method !== "GET" ? { body: payload } : {}),
        });
        if (!res.ok) {
          failTest("webhook_error", `HTTP ${res.status}`);
        }
        break;
      }

      case "wechat": {
        const webhookUrl = String(settings["wechatWebhookUrl"] ?? "").trim();
        if (!webhookUrl) {
          failTest("missing_config", "WeCom Webhook URL is required");
        }
        const wechatCheck = validateExternalUrl(webhookUrl);
        if (!wechatCheck.ok) {
          failTest("invalid_url", wechatCheck.reason);
        }
        const msgType = String(settings["wechatMessageType"] ?? "text");
        const content = msgType === "markdown"
          ? { msgtype: "markdown", markdown: { content: "**Qreminder** test notification\n> If you see this, WeCom is configured correctly." } }
          : { msgtype: "text", text: { content: "Qreminder test notification\nIf you see this, WeCom is configured correctly." } };
        const res = await fetchExternalUrl(wechatCheck.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content),
        });
        if (!res.ok) {
          failTest("wechat_error", `HTTP ${res.status}`);
        }
        break;
      }

      case "notifyx": {
        const apiKey = String(settings["notifyxApiKey"] ?? "").trim();
        if (!apiKey) {
          failTest("missing_config", "API Key is required");
        }
        const res = await fetch("https://api.notifyx.cn/api/v1/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body: JSON.stringify({ title: "Qreminder Test", content: "If you see this, NotifyX is configured correctly." }),
        });
        if (!res.ok) {
          failTest("notifyx_error", `HTTP ${res.status}`);
        }
        break;
      }

      case "email": {
        const deps = c.get("deps");
        const recipients = parseEmailRecipients(
          settings["recipientEmail"],
          user.email,
          Boolean(settings["notifyMultipleAddresses"]),
        );
        try {
          assertValidEmailRecipients(recipients);
        } catch (err) {
          failTest("invalid_recipient", err instanceof Error ? err.message : "Invalid recipient email");
        }
        const sent = await deps.mailer.send({
          to: recipients,
          subject: "Qreminder · Test notification",
          text: "If you see this email, your email notification channel is configured correctly.",
        });
        deliveryId = sent.id;
        break;
      }

      case "serverchan": {
        const sendKey = String(settings["serverchanSendKey"] ?? "").trim();
        if (!sendKey) {
          failTest("missing_config", "SendKey is required");
        }
        const res = await fetch(`https://sctapi.ftqq.com/${sendKey}.send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Qreminder Test",
            desp: "If you see this message, ServerChan is configured correctly.",
          }),
        });
        if (!res.ok) {
          failTest("serverchan_error", `HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (data["code"] !== 0 && data["errno"] !== 0) {
          failTest("serverchan_error", String(data["message"] ?? data["errmsg"] ?? "Unknown error"));
        }
        break;
      }
    }

    await recordNotificationTestJob(db, {
      userId,
      workspaceId,
      channel,
      settings,
      status: "sent",
      ...(deliveryId ? { deliveryId } : {}),
    });
    return c.json({ ok: true });
  } catch (err) {
    const expected = err instanceof NotificationTestError;
    const raw = err instanceof Error ? err.message : "Unknown error";
    const isNetwork = raw.includes("timeout") || raw.includes("ETIMEDOUT") || raw.includes("fetch failed") || raw.includes("ECONNREFUSED");
    const message = expected
      ? raw
      : isNetwork
      ? `Network unreachable (${channel}): ${raw}. Check if the target service is accessible from your server.`
      : `${channel} send failed: ${raw}`;
    await recordNotificationTestJob(db, {
      userId,
      workspaceId,
      channel,
      settings,
      status: "failed",
      errorMessage: message,
    }).catch((logErr) => {
      console.error("[notification-test] failed to record test job:", logErr);
    });
    const status = expected ? err.status : 500;
    const error = expected ? err.code : "send_failed";
    return c.json({ error, channel, message }, status as 400 | 500);
  }
});

export const __testing__ = {
  buildBarkTestUrl,
  fetchExternalUrl,
  validateExternalUrl,
};
