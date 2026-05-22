import { Hono } from "hono";
import { z } from "zod";
import { requireSession } from "../middleware/require-session.js";
import type { AppEnv } from "../app.js";

export const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.use("*", requireSession);

const testSchema = z.object({
  channel: z.enum(["telegram", "notifyx", "webhook", "wechat", "email", "bark"]),
  settings: z.record(z.string(), z.unknown()),
});

notificationsRouter.post("/test", async (c) => {
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
        const url = `${serverUrl.replace(/\/$/, "")}/${deviceKey}/Qreminder Test/If you see this, Bark is configured correctly.`;
        const res = await fetch(url);
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
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const rawHeaders = String(settings["webhookHeaders"] ?? "").trim();
        if (rawHeaders) {
          try {
            Object.assign(headers, JSON.parse(rawHeaders));
          } catch { /* ignore invalid headers */ }
        }
        const payload = JSON.stringify({ event: "test", message: "Qreminder test notification" });
        const res = await fetch(webhookUrl, {
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
        const msgType = String(settings["wechatMessageType"] ?? "text");
        const content = msgType === "markdown"
          ? { msgtype: "markdown", markdown: { content: "**Qreminder** test notification\n> If you see this, WeCom is configured correctly." } }
          : { msgtype: "text", text: { content: "Qreminder test notification\nIf you see this, WeCom is configured correctly." } };
        const res = await fetch(webhookUrl, {
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
    }

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "send_failed", message }, 500);
  }
});
