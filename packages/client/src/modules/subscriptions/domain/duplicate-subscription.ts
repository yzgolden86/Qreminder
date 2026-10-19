/**
 * 复制订阅的领域规则。
 *
 * 架构位置：
 * - 卡片菜单「复制订阅」需要把一条订阅转成可直接 POST 的 draft。
 * - 这里保持纯函数：不读 React state、不发请求，便于单测覆盖日期与字段规则。
 *
 * 规则：
 * - 名称追加后缀（如「（副本）」），并保证不超过 120 字符上限。
 * - 新订阅从「今天」开始，下次扣费日按同一周期重新推算；不继承旧订阅的到期日。
 * - 试用结束日只在仍处于未来时保留，避免复制出一个已过期的试用。
 * - 不继承 snoozedUntil / lastUsedAt：那是原订阅的历史状态。
 */
import type { Subscription, SubscriptionDraft } from "@/types/subscription";
import { calculateNextBillingDate } from "@/lib/subscription-billing";
import { compareDateOnly, type DateOnly } from "@/lib/time/date-only";

/** 与后端 schema 的 name.max(120) 保持一致。 */
const MAX_NAME_LENGTH = 120;

export interface DuplicateSubscriptionOptions {
  /** 用户时区下的今天，作为新订阅的开始日。 */
  today: DateOnly;
  /** 名称后缀，例如「（副本）」/「 (copy)」。 */
  suffix: string;
}

/** 生成名称：优先保证后缀完整，超出上限时截断原名。 */
function buildDuplicateName(name: string, suffix: string): string {
  const trimmedSuffix = suffix.slice(0, MAX_NAME_LENGTH);
  const room = MAX_NAME_LENGTH - trimmedSuffix.length;
  return `${name.slice(0, room)}${trimmedSuffix}`;
}

/** 把一条订阅转换成「复制品」的创建草稿。 */
export function buildDuplicateDraft(
  source: Subscription,
  options: DuplicateSubscriptionOptions,
): SubscriptionDraft {
  const { today, suffix } = options;
  const nextBillingDate = calculateNextBillingDate(today, source.billingCycle, source.customDays);
  // 试用已结束就不要再复制过来，否则新订阅一创建就显示为过期试用。
  const trialEndDate =
    source.trialEndDate && compareDateOnly(source.trialEndDate, today) >= 0
      ? source.trialEndDate
      : undefined;

  const base = {
    name: buildDuplicateName(source.name, suffix),
    logo: source.logo,
    price: source.price,
    currency: source.currency,
    category: source.category,
    status: source.status,
    paymentMethod: source.paymentMethod,
    startDate: today,
    nextBillingDate,
    autoCalculateNextBillingDate: source.autoCalculateNextBillingDate,
    trialEndDate,
    website: source.website,
    notes: source.notes,
    // 数组要复制，避免副本和原件共享同一个引用。
    tags: [...source.tags],
    reminderOffsets: [...source.reminderOffsets],
  };

  if (source.billingCycle === "custom") {
    return { ...base, billingCycle: "custom", customDays: source.customDays };
  }
  return { ...base, billingCycle: source.billingCycle, customDays: undefined };
}
