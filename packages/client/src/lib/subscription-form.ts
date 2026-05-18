/**
 * 订阅表单转换工具。
 *
 * 架构位置：
 * - 表单组件只维护输入态。
 * - 这里把输入态转换成 domain draft，供新增/编辑弹窗复用。
 *
 * Caveat: 上传中的 logo/icon 状态不在这里判断，调用方需要在提交按钮层面禁用保存。
 */
import type { SubscriptionDraft } from "@/types/subscription";
import {
  MAX_REMINDER_OFFSET,
  MAX_REMINDER_OFFSETS_PER_SUBSCRIPTION,
  normalizeReminderOffsets,
} from "@/types/subscription";
import type { SubscriptionFormState } from "@/types/subscription-form";
import { getApiLocale } from "@/i18n/api-locale";
import { translate } from "@/i18n/messages";

const MAX_PRICE = 1_000_000_000;
const MAX_DAYS = 3650;

/** 严格解析非负有限数，拒绝 `1e3` 等浏览器/后端口径可能不一致的写法。 */
export function parseNonNegativeFiniteNumberInput(input: string, max = MAX_PRICE): number | null {
  const value = input.trim();
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return parsed;
}

/** 严格解析非负整数，避免 `01`、小数和单位后缀被隐式接受。 */
export function parseNonNegativeIntegerInput(input: string, max = MAX_DAYS): number | null {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) return null;
  return parsed;
}

/** 严格解析正整数；用于自定义扣费周期等必须大于 0 的输入。 */
export function parsePositiveIntegerInput(input: string, max = MAX_DAYS): number | null {
  const parsed = parseNonNegativeIntegerInput(input, max);
  if (parsed === null || parsed <= 0) return null;
  return parsed;
}

/** 校验可选 URL：空值允许；非空时只接受 http(s)。 */
export function isOptionalHttpUrl(input: string | null | undefined): boolean {
  const value = input?.trim() ?? "";
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 将标签输入（分隔字符串）转换为标签数组。
 *
 * 注意：
 * - 兼容多种分隔符：顿号 `、` / 中文逗号 `，` / 英文逗号 `,` / 分号 `;；` / 换行
 * - 会 trim 并过滤空项（例如连续分隔符、首尾分隔符）
 */
export function parseTagsInput(tags: string): string[] {
  if (!tags) return [];
  return tags
    .split(/[、，,;；\n]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * 添加自定义提醒档位到已选数组。
 *
 * 规则：
 * - 解析失败返回 invalid
 * - 已存在返回 duplicate
 * - 超过 16 项上限返回 tooMany
 * - 成功时返回去重 + 降序排列的新数组
 */
export type AddReminderOffsetReason = "invalid" | "duplicate" | "tooMany";

export interface AddReminderOffsetResult {
  next: number[];
  accepted: boolean;
  reason?: AddReminderOffsetReason;
}

export function addCustomReminderOffset(current: readonly number[], rawInput: string): AddReminderOffsetResult {
  const parsed = parseNonNegativeIntegerInput(rawInput, MAX_REMINDER_OFFSET);
  if (parsed === null) {
    return { next: [...current], accepted: false, reason: "invalid" };
  }
  if (current.includes(parsed)) {
    return { next: [...current], accepted: false, reason: "duplicate" };
  }
  if (current.length >= MAX_REMINDER_OFFSETS_PER_SUBSCRIPTION) {
    return { next: [...current], accepted: false, reason: "tooMany" };
  }
  const merged = normalizeReminderOffsets([...current, parsed]);
  return { next: merged, accepted: true };
}

/** 从已选档位中移除指定值。 */
export function removeReminderOffset(current: readonly number[], value: number): number[] {
  return current.filter((existing) => existing !== value);
}

/** 切换某个预设档位（已有则移除，未有则加入）。 */
export function toggleReminderOffset(current: readonly number[], value: number): number[] {
  if (current.includes(value)) {
    return removeReminderOffset(current, value);
  }
  return normalizeReminderOffsets([...current, value]);
}

/** 返回订阅草稿的首个阻塞性校验错误；用于提交前给用户明确反馈。 */
export function getSubscriptionDraftValidationError(formData: SubscriptionFormState): string | null {
  const locale = getApiLocale();
  if (!formData.name.trim()) return translate(locale, "subscription.validation.nameRequired");
  if (!formData.startDate || !formData.nextBillingDate) return translate(locale, "subscription.validation.datesRequired");
  if (parseNonNegativeFiniteNumberInput(formData.price) === null) return translate(locale, "subscription.validation.amountInvalid");
  if (formData.reminderOffsets.length === 0) {
    return translate(locale, "subscription.validation.reminderRequired");
  }
  if (formData.billingCycle === "custom" && parsePositiveIntegerInput(formData.customDays) === null) {
    return translate(locale, "subscription.validation.customCycleInvalid");
  }
  if (!isOptionalHttpUrl(formData.website)) return translate(locale, "subscription.validation.websiteInvalid");
  return null;
}

/**
 * 将 UI 表单状态转换为可保存的订阅对象（不含 id）。
 *
 * 说明：
 * - 若 startDate/nextBillingDate 缺失则返回 null（由调用方决定如何处理）
 * - 该函数不关心“是否允许提交”（例如上传中、必填校验），只负责数据形态转换
 */
export function toSubscriptionDraft(formData: SubscriptionFormState): SubscriptionDraft | null {
  if (getSubscriptionDraftValidationError(formData)) return null;

  const price = parseNonNegativeFiniteNumberInput(formData.price);
  const reminderOffsets = normalizeReminderOffsets(formData.reminderOffsets);
  const customDays = formData.billingCycle === "custom" ? parsePositiveIntegerInput(formData.customDays) : undefined;
  const { startDate, nextBillingDate } = formData;
  if (
    price === null ||
    reminderOffsets.length === 0 ||
    !startDate ||
    !nextBillingDate ||
    (formData.billingCycle === "custom" && customDays === null)
  ) {
    return null;
  }

  const base = {
    name: formData.name,
    logo: formData.logo,
    price,
    currency: formData.currency,
    category: formData.category,
    status: formData.status,
    paymentMethod: formData.paymentMethod || undefined,
    startDate,
    nextBillingDate,
    autoCalculateNextBillingDate: formData.autoCalculate,
    trialEndDate: undefined,
    reminderOffsets,
    website: formData.website || undefined,
    notes: formData.notes || undefined,
    tags: parseTagsInput(formData.tags),
  };
  if (formData.billingCycle === "custom") {
    return {
      ...base,
      billingCycle: "custom",
      customDays: customDays ?? 1,
    };
  }
  return {
    ...base,
    billingCycle: formData.billingCycle,
    customDays: undefined,
  };
}
