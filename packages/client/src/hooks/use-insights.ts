/**
 * Insights hooks — duplicates + cancel suggestions.
 *
 * 数据较小，dashboard 打开时按需触发；不放 staleTime 因为用户改了订阅后期望立即看到更新。
 */
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const duplicateMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  currency: z.string(),
  billingCycle: z.string(),
  category: z.string(),
  status: z.string(),
  logo: z.string().nullable(),
});

const duplicatesResponseSchema = z.object({
  groups: z.array(z.object({
    reason: z.enum(["same-name", "similar-name", "same-category-price"]),
    confidence: z.number(),
    reasonKey: z.string(),
    members: z.array(duplicateMemberSchema),
  })),
});

const cancelSuggestionsResponseSchema = z.object({
  suggestions: z.array(z.object({
    subscriptionId: z.string(),
    name: z.string(),
    price: z.number(),
    currency: z.string(),
    billingCycle: z.string(),
    category: z.string(),
    confidence: z.number(),
    reasons: z.array(z.string()),
    context: z.object({
      daysSinceLastUse: z.number().optional(),
      monthlyEquivalentPrice: z.number().optional(),
      trialOverdueDays: z.number().optional(),
      cheaperAlternativeId: z.string().optional(),
    }),
  })),
});

export type DuplicateMember = z.infer<typeof duplicateMemberSchema>;
export type DuplicatesResponse = z.infer<typeof duplicatesResponseSchema>;
export type CancelSuggestionsResponse = z.infer<typeof cancelSuggestionsResponseSchema>;
export type CancelSuggestion = CancelSuggestionsResponse["suggestions"][number];

export function useDetectDuplicates() {
  return useMutation({
    mutationFn: () =>
      apiFetch("/api/insights/duplicates", duplicatesResponseSchema, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });
}

export function useCancelSuggestions() {
  return useMutation({
    mutationFn: () =>
      apiFetch("/api/insights/cancel-suggestions", cancelSuggestionsResponseSchema, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });
}
