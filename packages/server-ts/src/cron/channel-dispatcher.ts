/**
 * channel-dispatcher.ts — 统一通知渠道发送器。
 *
 * 被 notification-cron 调用，根据用户 enabledChannels 逐一发送。
 * 每个渠道独立 try/catch，单渠道失败不阻断其他渠道。
 *
 * Fallback 语义：当一组渠道全部失败时，调用方可以再调一次本函数尝试 fallback
 * 渠道；本函数本身保持单层语义，由 notification-cron 编排两段调用。
 */
import type { MailerAdapter } from "../adapters/mailer.js";
import { assertExternalHttpUrl } from "../lib/external-url.js";
import { assertValidEmailRecipients, parseEmailRecipients } from "../lib/email-recipients.js";

export interface ChannelMessage {
  title: string;
  body: string;
  html?: string;
}

export interface ChannelSendResult {
  channel: string;
  success: boolean;
  error?: string;
  /** True if this attempt was a fallback after primary channels failed. */
  fallback?: boolean;
}

export interface DispatchResult {
  results: ChannelSendResult[];
  anySuccess: boolean;
}

interface DispatchDeps {
  mailer: MailerAdapter;
}

export async function dispatchToChannels(
  deps: DispatchDeps,
  channels: string[],
  settings: Record<string, unknown>,
  userEmail: string,
  message: ChannelMessage,
  options: { markAsFallback?: boolean } = {},
): Promise<DispatchResult> {
  const results: ChannelSendResult[] = [];

  for (const channel of channels) {
    try {
      await sendToChannel(deps, channel, settings, userEmail, message);
      results.push({
        channel,
        success: true,
        ...(options.markAsFallback ? { fallback: true } : {}),
      });
    } catch (err) {
      results.push({
        channel,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        ...(options.markAsFallback ? { fallback: true } : {}),
      });
    }
  }

  return {
    results,
    anySuccess: results.some((r) => r.success),
  };
}

async function sendToChannel(
  deps: DispatchDeps,
  channel: string,
  settings: Record<string, unknown>,
  userEmail: string,
  message: ChannelMessage,
): Promise<void> {
  switch (channel) {
    case "email":
      return sendEmail(deps, settings, userEmail, message);
    case "telegram":
      return sendTelegram(settings, message);
    case "wechat":
      return sendWechat(settings, message);
    case "bark":
      return sendBark(settings, message);
    case "notifyx":
      return sendNotifyx(settings, message);
    case "webhook":
      return sendWebhook(settings, message);
    case "serverchan":
      return sendServerchan(settings, message);
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}

async function sendEmail(
  deps: DispatchDeps,
  settings: Record<string, unknown>,
  userEmail: string,
  message: ChannelMessage,
): Promise<void> {
  const recipients = parseEmailRecipients(
    settings["recipientEmail"],
    userEmail,
    Boolean(settings["notifyMultipleAddresses"]),
  );
  assertValidEmailRecipients(recipients);
  const mailMessage = {
    to: recipients,
    subject: message.title,
    text: message.body,
    ...(message.html ? { html: message.html } : {}),
  };
  await deps.mailer.send({
    ...mailMessage,
  });
}

async function sendTelegram(
  settings: Record<string, unknown>,
  message: ChannelMessage,
): Promise<void> {
  const token = String(settings["telegramBotToken"] ?? "").trim();
  const chatId = String(settings["telegramChatId"] ?? "").trim();
  if (!token || !chatId) throw new Error("Telegram: missing botToken or chatId");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `*${message.title}*\n\n${message.body}`,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(`Telegram HTTP ${res.status}: ${err["description"] ?? "unknown"}`);
  }
}

async function fetchExternal(url: string, init: RequestInit = {}): Promise<Response> {
  const safeUrl = assertExternalHttpUrl(url).toString();
  const response = await fetch(safeUrl, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("External URL redirects are not allowed");
  }
  return response;
}

async function sendWechat(
  settings: Record<string, unknown>,
  message: ChannelMessage,
): Promise<void> {
  const webhookUrl = String(settings["wechatWebhookUrl"] ?? "").trim();
  if (!webhookUrl) throw new Error("WeCom: missing webhookUrl");
  const msgType = String(settings["wechatMessageType"] ?? "text");
  const atAll = Boolean(settings["wechatAtAll"]);
  const atPhones = String(settings["wechatAtPhones"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let body: Record<string, unknown>;
  if (msgType === "markdown") {
    body = {
      msgtype: "markdown",
      markdown: { content: `**${message.title}**\n${message.body}` },
    };
  } else {
    const mentioned = atAll ? ["@all"] : atPhones;
    body = {
      msgtype: "text",
      text: {
        content: `${message.title}\n${message.body}`,
        mentioned_mobile_list: mentioned.length > 0 ? mentioned : undefined,
      },
    };
  }

  const res = await fetchExternal(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WeCom HTTP ${res.status}`);
}

async function sendBark(
  settings: Record<string, unknown>,
  message: ChannelMessage,
): Promise<void> {
  const serverUrl = String(settings["barkServerUrl"] ?? "https://api.day.app").trim() || "https://api.day.app";
  const deviceKey = String(settings["barkDeviceKey"] ?? "").trim();
  if (!deviceKey) throw new Error("Bark: missing deviceKey");
  const silent = Boolean(settings["barkSilentPush"]);
  const url = assertExternalHttpUrl(serverUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${[deviceKey, message.title, message.body].map(encodeURIComponent).join("/")}`;
  if (silent) url.searchParams.set("level", "passive");
  const res = await fetchExternal(url.toString());
  if (!res.ok) throw new Error(`Bark HTTP ${res.status}`);
}

async function sendNotifyx(
  settings: Record<string, unknown>,
  message: ChannelMessage,
): Promise<void> {
  const apiKey = String(settings["notifyxApiKey"] ?? "").trim();
  if (!apiKey) throw new Error("NotifyX: missing apiKey");
  const res = await fetch("https://api.notifyx.cn/api/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ title: message.title, content: message.body }),
  });
  if (!res.ok) throw new Error(`NotifyX HTTP ${res.status}`);
}

async function sendWebhook(
  settings: Record<string, unknown>,
  message: ChannelMessage,
): Promise<void> {
  const webhookUrl = String(settings["webhookUrl"] ?? "").trim();
  if (!webhookUrl) throw new Error("Webhook: missing URL");
  const method = String(settings["webhookMethod"] ?? "POST").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const rawHeaders = String(settings["webhookHeaders"] ?? "").trim();
  if (rawHeaders) {
    try {
      Object.assign(headers, JSON.parse(rawHeaders));
    } catch { /* ignore invalid headers */ }
  }

  let payload: string;
  const rawPayload = String(settings["webhookPayload"] ?? "").trim();
  if (rawPayload) {
    payload = rawPayload
      .replace(/\{title\}/g, message.title)
      .replace(/\{content\}/g, message.body)
      .replace(/\{timestamp\}/g, new Date().toISOString());
  } else {
    payload = JSON.stringify({ title: message.title, content: message.body, timestamp: new Date().toISOString() });
  }

  const res = await fetchExternal(webhookUrl, {
    method,
    headers,
    ...(method !== "GET" ? { body: payload } : {}),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
}

async function sendServerchan(
  settings: Record<string, unknown>,
  message: ChannelMessage,
): Promise<void> {
  const sendKey = String(settings["serverchanSendKey"] ?? "").trim();
  if (!sendKey) throw new Error("ServerChan: missing sendKey");
  const res = await fetch(`https://sctapi.ftqq.com/${sendKey}.send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: message.title, desp: message.body }),
  });
  if (!res.ok) throw new Error(`ServerChan HTTP ${res.status}`);
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (data["code"] !== 0 && data["errno"] !== 0) {
    throw new Error(`ServerChan: ${data["message"] ?? data["errmsg"] ?? "unknown error"}`);
  }
}
