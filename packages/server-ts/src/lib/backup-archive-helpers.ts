export const SENSITIVE_SETTING_KEYS = [
  "aiApiKey",
  "telegramBotToken",
  "notifyxApiKey",
  "webhookHeaders",
  "wechatWebhookUrl",
  "barkDeviceKey",
  "serverchanSendKey",
  "smtpPassword",
  "webdavPassword",
  "icalToken",
] as const;

export function stripSensitiveSettings(value: Record<string, unknown>): Record<string, unknown> {
  const out = { ...value };
  for (const key of SENSITIVE_SETTING_KEYS) {
    delete out[key];
  }
  return out;
}

export function paymentRestoreKey(row: {
  subscriptionId: string | null;
  subscriptionName: string | null;
  paidAt: string;
  amount: number;
  currency: string;
  billingPeriod: string | null;
  paymentMethod: string | null;
  note: string | null;
}): string {
  return [
    row.subscriptionId ?? "",
    row.subscriptionName ?? "",
    row.paidAt,
    row.amount,
    row.currency,
    row.billingPeriod ?? "",
    row.paymentMethod ?? "",
    row.note ?? "",
  ].join("|");
}

export function budgetRestoreKey(row: {
  scopeType: string;
  scopeId: string | null;
  period: string;
  amount: number;
  currency: string;
  enabled: boolean;
}): string {
  return [
    row.scopeType,
    row.scopeId ?? "",
    row.period,
    row.amount,
    row.currency,
    row.enabled ? "1" : "0",
  ].join("|");
}

export function templateRestoreKey(row: {
  scope: string;
  scopeId: string | null;
  titleTemplate: string;
  bodyTemplate: string;
}): string {
  return [
    row.scope,
    row.scopeId ?? "",
    row.titleTemplate,
    row.bodyTemplate,
  ].join("|");
}

export function normalizeCycle(value: unknown): "weekly" | "monthly" | "quarterly" | "semi-annual" | "annual" | "custom" {
  const valid = ["weekly", "monthly", "quarterly", "semi-annual", "annual", "custom"] as const;
  const s = String(value ?? "monthly");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "monthly";
}

export function normalizeStatus(value: unknown): "trial" | "active" | "paused" | "cancelled" {
  const valid = ["trial", "active", "paused", "cancelled"] as const;
  const s = String(value ?? "active");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "active";
}

export function normalizeScopeType(value: unknown): "global" | "category" | "tag" | "payment_method" {
  const valid = ["global", "category", "tag", "payment_method"] as const;
  const s = String(value ?? "global");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "global";
}

export function normalizeTemplateScope(value: unknown): "global" | "channel" | "subscription" {
  const valid = ["global", "channel", "subscription"] as const;
  const s = String(value ?? "global");
  if ((valid as readonly string[]).includes(s)) return s as typeof valid[number];
  return "global";
}
