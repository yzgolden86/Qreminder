import { Hono } from "hono";
import { z } from "zod";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.use("*", requireSession);

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p))) return false;
  const octets = parts.map(Number);
  if (octets[0] === 10) return true;
  if (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 127) return true;
  if (octets[0] === 169 && octets[1] === 254) return true;
  if (octets[0] === 0) return true;
  return false;
}

function validateExternalUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "Only http/https URLs are allowed" };
  }
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: "Requests to private/internal networks are not allowed" };
  }
  return { ok: true, url: parsed.toString() };
}

const testSchema = z.object({
  channel: z.enum(["telegram", "notifyx", "webhook", "wechat", "email", "bark", "serverchan"]),
  settings: z.record(z.string(), z.unknown()),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

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

notificationsRouter.post("/test", async (c) => {
  const userId = (c.get("user") as { id: string }).id;
  if (!checkRateLimit(userId)) {
    return c.json({ error: "rate_limited", message: "Too many test requests, please wait a moment" }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body" }, 400);
  }

  const { channel, settings } = parsed.data;

  try {
    switch (channel) {
      case "telegram": {
        const token = String(settings["telegramBotToken"] ?? "").trim();
        const chatId = String(settings["telegramChatId"] ?? "").trim();
        if (!token || !chatId) {
          return c.json({ error: "missing_config", message: "Bot Token and Chat ID are required" }, 400);
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
          return c.json({ error: "telegram_error", message: (err as { description?: string }).description ?? "Send failed" }, 400);
        }
        break;
      }

      case "bark": {
        const serverUrl = String(settings["barkServerUrl"] ?? "https://api.day.app").trim();
        const deviceKey = String(settings["barkDeviceKey"] ?? "").trim();
        if (!deviceKey) {
          return c.json({ error: "missing_config", message: "Device Key is required" }, 400);
        }
        const barkTarget = `${serverUrl.replace(/\/$/, "")}/${deviceKey}/Qreminder Test/If you see this, Bark is configured correctly.`;
        const barkCheck = validateExternalUrl(barkTarget);
        if (!barkCheck.ok) {
          return c.json({ error: "invalid_url", message: barkCheck.reason }, 400);
        }
        const res = await fetch(barkCheck.url);
        if (!res.ok) {
          return c.json({ error: "bark_error", message: `HTTP ${res.status}` }, 400);
        }
        break;
      }

      case "webhook": {
        const webhookUrl = String(settings["webhookUrl"] ?? "").trim();
        const method = String(settings["webhookMethod"] ?? "POST").trim();
        if (!webhookUrl) {
          return c.json({ error: "missing_config", message: "Webhook URL is required" }, 400);
        }
        const webhookCheck = validateExternalUrl(webhookUrl);
        if (!webhookCheck.ok) {
          return c.json({ error: "invalid_url", message: webhookCheck.reason }, 400);
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const rawHeaders = String(settings["webhookHeaders"] ?? "").trim();
        if (rawHeaders) {
          try {
            Object.assign(headers, JSON.parse(rawHeaders));
          } catch { /* ignore invalid headers */ }
        }
        const payload = JSON.stringify({ event: "test", message: "Qreminder test notification" });
        const res = await fetch(webhookCheck.url, {
          method,
          headers,
          ...(method !== "GET" ? { body: payload } : {}),
        });
        if (!res.ok) {
          return c.json({ error: "webhook_error", message: `HTTP ${res.status}` }, 400);
        }
        break;
      }

      case "wechat": {
        const webhookUrl = String(settings["wechatWebhookUrl"] ?? "").trim();
        if (!webhookUrl) {
          return c.json({ error: "missing_config", message: "WeCom Webhook URL is required" }, 400);
        }
        const wechatCheck = validateExternalUrl(webhookUrl);
        if (!wechatCheck.ok) {
          return c.json({ error: "invalid_url", message: wechatCheck.reason }, 400);
        }
        const msgType = String(settings["wechatMessageType"] ?? "text");
        const content = msgType === "markdown"
          ? { msgtype: "markdown", markdown: { content: "**Qreminder** test notification\n> If you see this, WeCom is configured correctly." } }
          : { msgtype: "text", text: { content: "Qreminder test notification\nIf you see this, WeCom is configured correctly." } };
        const res = await fetch(wechatCheck.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content),
        });
        if (!res.ok) {
          return c.json({ error: "wechat_error", message: `HTTP ${res.status}` }, 400);
        }
        break;
      }

      case "notifyx": {
        const apiKey = String(settings["notifyxApiKey"] ?? "").trim();
        if (!apiKey) {
          return c.json({ error: "missing_config", message: "API Key is required" }, 400);
        }
        const res = await fetch("https://api.notifyx.cn/api/v1/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body: JSON.stringify({ title: "Qreminder Test", content: "If you see this, NotifyX is configured correctly." }),
        });
        if (!res.ok) {
          return c.json({ error: "notifyx_error", message: `HTTP ${res.status}` }, 400);
        }
        break;
      }

      case "email": {
        const deps = c.get("deps");
        const user = c.get("user") as { email: string };
        const recipient = String(settings["recipientEmail"] ?? user.email).trim();
        if (!recipient) {
          return c.json({ error: "missing_config", message: "Recipient email is required" }, 400);
        }
        await deps.mailer.send({
          to: [recipient],
          subject: "Qreminder · Test notification",
          text: "If you see this email, your email notification channel is configured correctly.",
        });
        break;
      }

      case "serverchan": {
        const sendKey = String(settings["serverchanSendKey"] ?? "").trim();
        if (!sendKey) {
          return c.json({ error: "missing_config", message: "SendKey is required" }, 400);
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
          return c.json({ error: "serverchan_error", message: `HTTP ${res.status}` }, 400);
        }
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (data["code"] !== 0 && data["errno"] !== 0) {
          return c.json({
            error: "serverchan_error",
            message: String(data["message"] ?? data["errmsg"] ?? "Unknown error"),
          }, 400);
        }
        break;
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "send_failed", message }, 500);
  }
});
