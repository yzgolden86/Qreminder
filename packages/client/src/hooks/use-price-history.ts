/**
 * 价格变更历史 hook。
 *
 * 调用 GET /api/subscriptions/:id/price-history 拉取某订阅的价格变更记录。
 * 仅当 subscriptionId 提供时启用查询，避免编辑模式打开但未指定订阅时空转。
 */
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const entrySchema = z.object({
  id: z.string(),
  user: z.string(),
  subscriptionId: z.string(),
  oldPrice: z.number(),
  newPrice: z.number(),
  oldCurrency: z.string(),
  newCurrency: z.string(),
  changedAt: z.string(),
});

const responseSchema = z.object({
  history: z.array(entrySchema),
});

export type PriceHistoryEntry = z.infer<typeof entrySchema>;

export function usePriceHistory(subscriptionId: string | undefined | null) {
  return useQuery({
    queryKey: ["price-history", subscriptionId],
    queryFn: () => apiFetch(`/api/subscriptions/${subscriptionId}/price-history`, responseSchema),
    enabled: !!subscriptionId,
  });
}
