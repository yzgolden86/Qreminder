/**
 * 卡片管理页（按支付方式聚合）领域模型。
 *
 * 架构位置：
 * - cards 页面以"支付方式"为主线展示订阅与月支出。
 * - 仅活跃/试用订阅计入月度口径，与首页统计保持一致；已暂停/已取消订阅不参与计算。
 */
import { toMonthlyAmount } from "@/lib/subscription-billing";
import type { ConfigItem, CustomConfig } from "@/types/config";
import type { Subscription } from "@/types/subscription";

/** 未指定支付方式订阅的内部分组键，避免与内置 `other` 撞键。 */
export const UNSPECIFIED_PAYMENT_KEY = "__unspecified__";

export interface PaymentCardGroup {
  /** 分组键：支付方式 value 或 UNSPECIFIED_PAYMENT_KEY。 */
  key: string;
  /** 关联的配置项（未指定分组为 null）。 */
  method: ConfigItem | null;
  /** 月度支出（已统一换算到默认货币）。 */
  monthly: number;
  /** 关联的订阅列表（按月度支出降序排列）。 */
  subscriptions: Subscription[];
  /** 占总月度支出的百分比（0-100）。 */
  shareOfTotalPercent: number;
}

interface BuildPaymentCardsModelInput {
  subscriptions: readonly Subscription[];
  config: CustomConfig;
  defaultCurrency: string;
  convert: (amount: number, from: string, to: string) => number;
}

export interface PaymentCardsModel {
  groups: PaymentCardGroup[];
  totalMethods: number;
  totalSubscriptions: number;
  totalMonthly: number;
}

/** 构建卡片管理页视图模型。 */
export function buildPaymentCardsModel({
  subscriptions,
  config,
  defaultCurrency,
  convert,
}: BuildPaymentCardsModelInput): PaymentCardsModel {
  const methodByValue = new Map(config.paymentMethods.map((method) => [method.value, method]));

  const active = subscriptions.filter((sub) => sub.status === "active" || sub.status === "trial");

  const monthlyBySubscriptionId = new Map<string, number>();
  for (const sub of active) {
    const amountInDefault = convert(sub.price, sub.currency, defaultCurrency);
    monthlyBySubscriptionId.set(
      sub.id,
      toMonthlyAmount(amountInDefault, sub.billingCycle, sub.customDays),
    );
  }

  const totalMonthly = Array.from(monthlyBySubscriptionId.values()).reduce(
    (sum, value) => sum + value,
    0,
  );

  const groupBuckets = new Map<string, Subscription[]>();
  for (const sub of active) {
    const key = sub.paymentMethod ?? UNSPECIFIED_PAYMENT_KEY;
    const list = groupBuckets.get(key);
    if (list) list.push(sub);
    else groupBuckets.set(key, [sub]);
  }

  const groups: PaymentCardGroup[] = [];
  for (const [key, subs] of groupBuckets) {
    const method = key === UNSPECIFIED_PAYMENT_KEY ? null : methodByValue.get(key) ?? null;
    const sortedSubs = subs
      .slice()
      .sort(
        (a, b) =>
          (monthlyBySubscriptionId.get(b.id) ?? 0) - (monthlyBySubscriptionId.get(a.id) ?? 0),
      );
    const monthly = sortedSubs.reduce(
      (sum, sub) => sum + (monthlyBySubscriptionId.get(sub.id) ?? 0),
      0,
    );
    groups.push({
      key,
      method,
      monthly,
      subscriptions: sortedSubs,
      shareOfTotalPercent: totalMonthly > 0 ? (monthly / totalMonthly) * 100 : 0,
    });
  }

  groups.sort((a, b) => {
    if (a.key === UNSPECIFIED_PAYMENT_KEY) return 1;
    if (b.key === UNSPECIFIED_PAYMENT_KEY) return -1;
    return b.monthly - a.monthly;
  });

  return {
    groups,
    totalMethods: groups.length,
    totalSubscriptions: active.length,
    totalMonthly,
  };
}

/** 取出某个订阅的月度支出（用于 UI 复用统计结果）。 */
export function getSubscriptionMonthlyAmount(
  subscription: Subscription,
  defaultCurrency: string,
  convert: (amount: number, from: string, to: string) => number,
): number {
  const amountInDefault = convert(subscription.price, subscription.currency, defaultCurrency);
  return toMonthlyAmount(amountInDefault, subscription.billingCycle, subscription.customDays);
}
