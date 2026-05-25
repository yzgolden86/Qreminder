/**
 * 推荐可取消订阅启发式。
 *
 * 信号（多个累加生成置信度）：
 * - lastUsedAt > 60 天前 → 强信号
 * - 单价高 + 长期 active → 中信号（如月费 > $30 或年费等价）
 * - 试用结束日已过且仍 active → 提示决定（升级/取消）
 * - 同分类下有更便宜的活跃订阅 → 弱信号（用户可能选错套餐）
 *
 * 与 [[insights-duplicates]] 互补：duplicates 关注"重复"，cancel 关注"低价值/低使用率"。
 */
import type { InferSelectModel } from "drizzle-orm";
import type { subscriptions } from "../db/schema.js";

type SubscriptionRow = InferSelectModel<typeof subscriptions>;

export interface CancelSuggestion {
  subscriptionId: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  category: string;
  /** Sum of reasons.length informs confidence; 0..1. */
  confidence: number;
  /** i18n keys for the client to render. */
  reasons: string[];
  /** Computed values for reason context (days since use, etc.). */
  context: {
    daysSinceLastUse?: number;
    monthlyEquivalentPrice?: number;
    trialOverdueDays?: number;
    cheaperAlternativeId?: string;
  };
}

const STALE_DAYS_THRESHOLD = 60;
const HIGH_MONTHLY_PRICE_USD_EQUIVALENT = 30;

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(fromIsoDate);
  const to = Date.parse(toIsoDate);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)));
}

function monthlyEquivalent(row: SubscriptionRow): number {
  // Best-effort conversion to a per-month figure for severity scoring. We deliberately ignore
  // currency conversion — the threshold is a soft heuristic and over-flagging cheaper-currency
  // subs is fine (user can dismiss).
  switch (row.billingCycle) {
    case "weekly":
      return row.price * 4.33;
    case "monthly":
      return row.price;
    case "quarterly":
      return row.price / 3;
    case "semi-annual":
      return row.price / 6;
    case "annual":
      return row.price / 12;
    case "custom":
      if (row.customDays && row.customDays > 0) {
        return (row.price / row.customDays) * 30;
      }
      return row.price;
    default:
      return row.price;
  }
}

export function suggestCancellations(
  rows: SubscriptionRow[],
): CancelSuggestion[] {
  const active = rows.filter((r) => r.status === "active" || r.status === "trial");
  if (active.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);

  // Pre-compute the cheapest active sub per category (for the "cheaper alternative" signal).
  // Compare monthly-equivalent prices so weekly/annual aren't unfairly grouped.
  const cheapestByCategory = new Map<string, { id: string; monthly: number }>();
  for (const row of active) {
    if (!row.category) continue;
    const monthly = monthlyEquivalent(row);
    const existing = cheapestByCategory.get(row.category);
    if (!existing || monthly < existing.monthly) {
      cheapestByCategory.set(row.category, { id: row.id, monthly });
    }
  }

  const suggestions: CancelSuggestion[] = [];

  for (const row of active) {
    const reasons: string[] = [];
    const context: CancelSuggestion["context"] = {};

    // Signal 1: not used in a long time
    if (row.lastUsedAt) {
      const days = daysBetween(row.lastUsedAt, today);
      if (days >= STALE_DAYS_THRESHOLD) {
        reasons.push("insights.cancel.stale");
        context.daysSinceLastUse = days;
      }
    }

    // Signal 2: high price
    const monthly = monthlyEquivalent(row);
    if (monthly >= HIGH_MONTHLY_PRICE_USD_EQUIVALENT) {
      reasons.push("insights.cancel.highPrice");
      context.monthlyEquivalentPrice = Math.round(monthly * 100) / 100;
    }

    // Signal 3: trial ended (status still trial or active but trialEndDate has passed)
    if (row.trialEndDate) {
      const overdue = daysBetween(row.trialEndDate, today);
      if (overdue > 0) {
        reasons.push("insights.cancel.trialOver");
        context.trialOverdueDays = overdue;
      }
    }

    // Signal 4: cheaper alternative in same category
    if (row.category) {
      const cheapest = cheapestByCategory.get(row.category);
      if (cheapest && cheapest.id !== row.id && cheapest.monthly < monthly * 0.7) {
        reasons.push("insights.cancel.cheaperAlternative");
        context.cheaperAlternativeId = cheapest.id;
      }
    }

    if (reasons.length === 0) continue;

    // Confidence: 1 signal = 0.4, 2 = 0.65, 3 = 0.85, 4 = 0.95
    const confidence = Math.min(0.95, 0.2 + reasons.length * 0.2);

    suggestions.push({
      subscriptionId: row.id,
      name: row.name,
      price: row.price,
      currency: row.currency,
      billingCycle: row.billingCycle,
      category: row.category,
      confidence,
      reasons,
      context,
    });
  }

  // Sort: stronger signals first, then larger monthly cost
  return suggestions.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (b.context.monthlyEquivalentPrice ?? 0) - (a.context.monthlyEquivalentPrice ?? 0);
  });
}

export const __testing__ = {
  monthlyEquivalent,
  daysBetween,
};
