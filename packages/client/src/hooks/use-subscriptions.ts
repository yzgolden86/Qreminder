/**
 * 订阅相关 React Query Hooks（前端数据层）。
 *
 * 通过 `/api/subscriptions` 与后端交互（server-ts Hono 路由）。
 * 后端使用 Better Auth cookie 鉴权，前端无需手动注入 token。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertDateOnly } from "@/lib/time/date-only";
import { apiFetch } from "@/lib/api-client";
import {
  apiSubscriptionSchema,
  subscriptionsListResponseSchema,
  subscriptionResponseSchema,
  subscriptionDeleteResponseSchema,
  type ApiSubscription,
} from "@/lib/api/schemas/subscriptions";
import type { Subscription, SubscriptionDraft } from "@/types/subscription";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function normalizeSubscriptionRecord(row: unknown): unknown {
  if (!isRecord(row)) return row;
  const normalized: Record<string, unknown> = {
    id: row["id"],
    name: row["name"],
    price: row["price"],
    currency: row["currency"],
    billingCycle: row["billingCycle"],
    category: row["category"],
    status: row["status"],
    startDate: row["startDate"],
    nextBillingDate: row["nextBillingDate"],
    autoCalculateNextBillingDate: row["autoCalculateNextBillingDate"],
  };
  // v1 后端只发 reminderDays:number，v2 改成 reminderOffsets:number[]；
  // 升级窗口期前端会同时遇到两种数据，唯一边界把旧字段包成单项数组。
  if (Array.isArray(row["reminderOffsets"])) {
    normalized["reminderOffsets"] = row["reminderOffsets"];
  } else if (typeof row["reminderDays"] === "number") {
    normalized["reminderOffsets"] = [row["reminderDays"]];
  } else {
    normalized["reminderOffsets"] = [];
  }
  if (typeof row["customDays"] === "number") normalized["customDays"] = row["customDays"];
  if (Array.isArray(row["tags"])) normalized["tags"] = row["tags"];

  for (const key of ["logo", "paymentMethod", "trialEndDate", "website", "notes"] as const) {
    const value = optionalNonEmptyString(row[key]);
    if (value !== undefined) normalized[key] = value;
  }
  const createdAt = optionalNonEmptyString(row["createdAt"]) ?? optionalNonEmptyString(row["created"]);
  if (createdAt !== undefined) normalized["createdAt"] = createdAt;
  const updatedAt = optionalNonEmptyString(row["updatedAt"]) ?? optionalNonEmptyString(row["updated"]);
  if (updatedAt !== undefined) normalized["updatedAt"] = updatedAt;

  return normalized;
}

function fromApiSubscription(row: ApiSubscription | unknown): Subscription {
  const parsedRow = apiSubscriptionSchema.parse(normalizeSubscriptionRecord(row));
  const base = {
    id: parsedRow.id,
    name: parsedRow.name,
    logo: parsedRow.logo,
    price: parsedRow.price,
    currency: parsedRow.currency,
    category: parsedRow.category,
    status: parsedRow.status,
    paymentMethod: parsedRow.paymentMethod,
    startDate: assertDateOnly(parsedRow.startDate),
    nextBillingDate: assertDateOnly(parsedRow.nextBillingDate),
    autoCalculateNextBillingDate: parsedRow.autoCalculateNextBillingDate,
    trialEndDate: parsedRow.trialEndDate ? assertDateOnly(parsedRow.trialEndDate) : undefined,
    website: parsedRow.website,
    notes: parsedRow.notes,
    tags: parsedRow.tags ?? [],
    reminderOffsets: parsedRow.reminderOffsets,
  };
  if (parsedRow.billingCycle === "custom") {
    return {
      ...base,
      billingCycle: "custom",
      customDays: parsedRow.customDays ?? 1,
    };
  }
  return {
    ...base,
    billingCycle: parsedRow.billingCycle,
    customDays: undefined,
  };
}

function toWritePayload(sub: SubscriptionDraft | Subscription) {
  return {
    name: sub.name,
    logo: sub.logo ?? null,
    price: sub.price,
    currency: sub.currency,
    billingCycle: sub.billingCycle,
    customDays: sub.customDays ?? null,
    category: sub.category,
    status: sub.status,
    paymentMethod: sub.paymentMethod ?? null,
    startDate: sub.startDate,
    nextBillingDate: sub.nextBillingDate,
    autoCalculateNextBillingDate: sub.autoCalculateNextBillingDate,
    trialEndDate: sub.trialEndDate ?? null,
    website: sub.website ?? null,
    notes: sub.notes ?? null,
    tags: sub.tags ?? [],
    reminderOffsets: sub.reminderOffsets,
  };
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const res = await apiFetch("/api/subscriptions", subscriptionsListResponseSchema);
      return res.subscriptions.map(fromApiSubscription);
    },
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sub: SubscriptionDraft) => {
      const res = await apiFetch("/api/subscriptions", subscriptionResponseSchema, {
        method: "POST",
        body: JSON.stringify(toWritePayload(sub)),
      });
      return fromApiSubscription(res.subscription);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sub: Subscription) => {
      const res = await apiFetch(
        `/api/subscriptions/${encodeURIComponent(sub.id)}`,
        subscriptionResponseSchema,
        {
          method: "PATCH",
          body: JSON.stringify(toWritePayload(sub)),
        },
      );
      return fromApiSubscription(res.subscription);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(
        `/api/subscriptions/${encodeURIComponent(id)}`,
        subscriptionDeleteResponseSchema,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}
