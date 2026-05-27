import type { NotificationHit, Subscription } from "@qreminder/shared";
import type { ChannelMessage } from "./channel-dispatcher.js";

export interface GroupedNotificationHit {
  hit: NotificationHit;
  sub: Subscription | undefined;
}

interface ReminderItem {
  kind: "renewal" | "trial";
  name: string;
  timing: string;
  date: string;
  amount?: string;
  category?: string;
  paymentMethod?: string;
  website?: string;
}

export function buildDefaultChannelMessage(groupedHits: GroupedNotificationHit[]): ChannelMessage {
  const items = groupedHits.map(toReminderItem);
  const renewalCount = items.filter((item) => item.kind === "renewal").length;
  const trialCount = items.filter((item) => item.kind === "trial").length;
  const title = buildTitle(items, renewalCount, trialCount);
  const body = buildTextBody(items, renewalCount, trialCount);
  return {
    title,
    body,
    html: buildRichEmailHtml(title, items, renewalCount, trialCount),
  };
}

export function buildPlainEmailHtml(title: string, body: string): string {
  return emailShell(
    title,
    `<div style="${styles.panel}">
      <h1 style="${styles.h1}">${escapeHtml(title)}</h1>
      <div style="${styles.copy}">${escapeHtml(body).replace(/\n/g, "<br>")}</div>
    </div>`,
  );
}

function toReminderItem({ hit, sub }: GroupedNotificationHit): ReminderItem {
  const targetDate = hit.kind === "trial"
    ? sub?.trialEndDate ?? sub?.nextBillingDate ?? ""
    : sub?.nextBillingDate ?? "";
  const website = normalizeWebsiteUrl(sub?.website);
  return {
    kind: hit.kind,
    name: sub?.name ?? hit.subscriptionName,
    timing: formatDays(hit.daysUntil),
    date: targetDate,
    ...(sub ? { amount: `${sub.currency} ${formatAmount(sub.price)}` } : {}),
    ...(sub?.category ? { category: sub.category } : {}),
    ...(sub?.paymentMethod ? { paymentMethod: sub.paymentMethod } : {}),
    ...(website ? { website } : {}),
  };
}

function buildTitle(items: ReminderItem[], renewalCount: number, trialCount: number): string {
  if (items.length === 1) {
    const item = items[0]!;
    const action = item.kind === "trial" ? "试用到期" : "即将续费";
    return `Qreminder · ${item.name} ${item.timing}${action}`;
  }
  const parts: string[] = [];
  if (renewalCount > 0) parts.push(`${renewalCount} 个续费`);
  if (trialCount > 0) parts.push(`${trialCount} 个试用到期`);
  return `Qreminder · ${parts.join("，")}待处理`;
}

function buildTextBody(items: ReminderItem[], renewalCount: number, trialCount: number): string {
  const lines = [
    `你有 ${items.length} 个订阅提醒需要关注。`,
    summaryLine(renewalCount, trialCount),
    "",
  ];

  for (const [index, item] of items.entries()) {
    lines.push(`${index + 1}. ${item.name}`);
    lines.push(`   类型: ${item.kind === "trial" ? "试用到期" : "订阅续费"}`);
    lines.push(`   时间: ${item.timing}${item.date ? ` (${item.date})` : ""}`);
    if (item.amount) lines.push(`   金额: ${item.amount}`);
    if (item.category) lines.push(`   分类: ${item.category}`);
    if (item.paymentMethod) lines.push(`   支付方式: ${item.paymentMethod}`);
    if (item.website) lines.push(`   访问: ${item.website}`);
    if (index < items.length - 1) lines.push("");
  }

  lines.push("");
  lines.push("如果已经处理，可以在 Qreminder 中更新订阅或付款记录。");
  return lines.join("\n");
}

function buildRichEmailHtml(
  title: string,
  items: ReminderItem[],
  renewalCount: number,
  trialCount: number,
): string {
  const hasWebsite = items.some((item) => item.website);
  const cards = items.map((item) => `
    <section style="${styles.card}">
      <div style="${styles.cardHeader}">
        <span style="${item.kind === "trial" ? styles.badgeTrial : styles.badgeRenewal}">
          ${item.kind === "trial" ? "试用到期" : "订阅续费"}
        </span>
        <span style="${styles.timing}">${escapeHtml(item.timing)}</span>
      </div>
      <h2 style="${styles.h2}">${escapeHtml(item.name)}</h2>
      <div style="${styles.metaGrid}">
        ${item.date ? metaCell("日期", item.date) : ""}
        ${item.amount ? metaCell("金额", item.amount) : ""}
        ${item.category ? metaCell("分类", item.category) : ""}
        ${item.paymentMethod ? metaCell("支付方式", item.paymentMethod) : ""}
      </div>
      ${item.website ? `
        <a href="${escapeAttribute(item.website)}" style="${styles.button}">
          访问订阅网站
        </a>
      ` : ""}
    </section>
  `).join("");

  return emailShell(
    title,
    `<div style="${styles.panel}">
      <p style="${styles.kicker}">Qreminder subscription reminder</p>
      <h1 style="${styles.h1}">${escapeHtml(title)}</h1>
      <p style="${styles.copy}">
        ${escapeHtml(summaryLine(renewalCount, trialCount))}
        ${hasWebsite ? "下面是本次提醒的详细信息，包含可访问的网站入口。" : "下面是本次提醒的详细信息。"}
      </p>
      ${cards}
      <p style="${styles.footer}">
        如果已经处理，可以在 Qreminder 中更新订阅或付款记录。
      </p>
    </div>`,
  );
}

function summaryLine(renewalCount: number, trialCount: number): string {
  const parts: string[] = [];
  if (renewalCount > 0) parts.push(`${renewalCount} 个订阅即将续费`);
  if (trialCount > 0) parts.push(`${trialCount} 个试用即将到期`);
  return parts.join("，") || "当前没有需要处理的提醒";
}

function metaCell(label: string, value: string): string {
  return `
    <div style="${styles.metaCell}">
      <div style="${styles.metaLabel}">${escapeHtml(label)}</div>
      <div style="${styles.metaValue}">${escapeHtml(value)}</div>
    </div>
  `;
}

function emailShell(title: string, content: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="${styles.body}">
    ${content}
  </body>
</html>`;
}

function formatDays(days: number): string {
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days > 1) return `${days} 天后`;
  return `已逾期 ${Math.abs(days)} 天`;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    const url = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const styles = {
  body: "margin:0;background:#f5f7fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
  panel: "max-width:680px;margin:0 auto;padding:32px 20px;",
  kicker: "margin:0 0 10px;color:#607089;font-size:12px;letter-spacing:.08em;text-transform:uppercase;",
  h1: "margin:0 0 12px;color:#101828;font-size:24px;line-height:1.3;font-weight:700;",
  h2: "margin:12px 0 14px;color:#101828;font-size:20px;line-height:1.3;font-weight:700;",
  copy: "margin:0 0 20px;color:#475467;font-size:15px;line-height:1.7;",
  card: "margin:16px 0;padding:20px;background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;",
  cardHeader: "display:flex;align-items:center;justify-content:space-between;gap:12px;",
  badgeRenewal: "display:inline-block;padding:4px 10px;border-radius:999px;background:#eef4ff;color:#175cd3;font-size:12px;font-weight:700;",
  badgeTrial: "display:inline-block;padding:4px 10px;border-radius:999px;background:#fff4ed;color:#b93815;font-size:12px;font-weight:700;",
  timing: "color:#667085;font-size:13px;font-weight:600;",
  metaGrid: "display:block;margin:0 0 16px;",
  metaCell: "display:inline-block;width:calc(50% - 8px);box-sizing:border-box;vertical-align:top;margin:0 8px 10px 0;padding:10px 12px;background:#f8fafc;border-radius:8px;",
  metaLabel: "margin-bottom:4px;color:#667085;font-size:12px;",
  metaValue: "color:#101828;font-size:14px;font-weight:600;word-break:break-word;",
  button: "display:inline-block;padding:10px 14px;border-radius:8px;background:#175cd3;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;",
  footer: "margin:22px 0 0;color:#667085;font-size:13px;line-height:1.6;",
} as const;
