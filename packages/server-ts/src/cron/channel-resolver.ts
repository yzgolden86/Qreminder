/**
 * 通知渠道解析器。
 *
 * 优先级：订阅独立渠道 > 标签默认渠道 > 分类默认渠道 > 用户默认渠道
 *
 * 被 notification-cron 调用，为每条订阅确定最终发送渠道列表。
 */
import { and, eq, sql } from "drizzle-orm";
import { subscriptionNotificationChannels } from "../db/schema.js";
import type { Database } from "../db/types.js";

export interface ChannelResolutionResult {
  channels: string[];
  source: "subscription" | "category" | "tag" | "user_default";
}

export async function resolveChannelsForSubscription(
  db: Database,
  userId: string,
  workspaceId: string | null,
  subscriptionId: string,
  subscriptionCategory: string,
  subscriptionTags: string[],
  userEnabledChannels: string[],
  userSettings: Record<string, unknown>,
): Promise<ChannelResolutionResult> {
  // 1. Check per-subscription channels
  const subChannels = await db
    .select()
    .from(subscriptionNotificationChannels)
    .where(
      workspaceId
        ? and(
            eq(subscriptionNotificationChannels.workspaceId, workspaceId),
            eq(subscriptionNotificationChannels.subscriptionId, subscriptionId),
          )
        : and(
            eq(subscriptionNotificationChannels.user, userId),
            sql`${subscriptionNotificationChannels.workspaceId} IS NULL`,
            eq(subscriptionNotificationChannels.subscriptionId, subscriptionId),
          ),
    );

  if (subChannels.length > 0) {
    return {
      channels: subChannels.map((r) => r.channel),
      source: "subscription",
    };
  }

  // 2. Check tag default channels (from user settings JSON)
  const tagDefaults = (userSettings["tagDefaultChannels"] ?? {}) as Record<string, string[]>;
  for (const tag of subscriptionTags) {
    const tagChannels = tagDefaults[tag];
    if (tagChannels && tagChannels.length > 0) {
      return { channels: tagChannels, source: "tag" };
    }
  }

  // 3. Check category default channels (from user settings JSON)
  const categoryDefaults = (userSettings["categoryDefaultChannels"] ?? {}) as Record<string, string[]>;
  const catChannels = categoryDefaults[subscriptionCategory];
  if (catChannels && catChannels.length > 0) {
    return { channels: catChannels, source: "category" };
  }

  // 4. Fall back to user default enabled channels
  return {
    channels: userEnabledChannels,
    source: "user_default",
  };
}

/**
 * 渲染通知模板变量。
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined) return match;
    return String(value);
  });
}

/**
 * 构建模板变量上下文。
 */
export function buildTemplateVariables(
  subscription: {
    name: string;
    price: number;
    currency: string;
    nextBillingDate: string;
    category: string;
    paymentMethod: string;
    website?: string;
  },
  daysLeft: number,
  userName?: string,
): Record<string, string | number> {
  return {
    "subscription.name": subscription.name,
    "subscription.amount": subscription.price,
    "subscription.currency": subscription.currency,
    "subscription.nextRenewalDate": subscription.nextBillingDate,
    "subscription.category": subscription.category,
    "subscription.paymentMethod": subscription.paymentMethod,
    "subscription.website": subscription.website ?? "",
    "daysLeft": daysLeft,
    "user.name": userName ?? "",
  };
}
