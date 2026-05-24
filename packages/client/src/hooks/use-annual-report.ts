/**
 * 年度财报 hook。
 *
 * 调用 GET /api/payments/annual-report 拉取某一年的聚合数据。
 */
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const responseSchema = z.object({
  year: z.number(),
  paymentCount: z.number(),
  totalSpent: z.number(),
  totalByCurrency: z.record(z.string(), z.number()),
  monthly: z.array(z.object({ month: z.string(), total: z.number() })),
  byCategory: z.record(z.string(), z.number()),
  topSubscriptions: z.array(
    z.object({ name: z.string(), amount: z.number(), currency: z.string() }),
  ),
  yoy: z.object({
    previousYearTotal: z.number(),
    changePercent: z.number().nullable(),
  }),
  activeSubscriptionsAtYearEnd: z.number(),
});

export type AnnualReport = z.infer<typeof responseSchema>;

export function useAnnualReport(year: number) {
  return useQuery({
    queryKey: ["annual-report", year],
    queryFn: () => apiFetch(`/api/payments/annual-report?year=${year}`, responseSchema),
  });
}
