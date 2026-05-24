import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const paymentSchema = z.object({
  id: z.string(),
  user: z.string(),
  // subscriptionId is nullable now: deleting a subscription detaches its
  // historical payments instead of cascading the row out of the ledger.
  subscriptionId: z.string().nullable().or(z.literal("")).transform((v) => v || null),
  subscriptionName: z.string().nullable().optional().transform((v) => v ?? ""),
  paidAt: z.string(),
  amount: z.number(),
  currency: z.string(),
  billingPeriod: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Payment = z.infer<typeof paymentSchema>;

const paymentsResponseSchema = z.object({
  payments: z.array(paymentSchema),
});

const statsResponseSchema = z.object({
  totalPayments: z.number(),
  monthlySpent: z.number(),
  yearlySpent: z.number(),
  monthlyCount: z.number().optional().default(0),
  yearlyCount: z.number().optional().default(0),
  monthlyByCurrency: z.record(z.string(), z.number()).optional().default({}),
  yearlyByCurrency: z.record(z.string(), z.number()).optional().default({}),
  byCategory: z.record(z.string(), z.number()),
  currentMonth: z.string().optional(),
});

export type PaymentStats = z.infer<typeof statsResponseSchema>;

const createResponseSchema = z.object({ id: z.string() });
const renewResponseSchema = z.object({
  paymentId: z.string(),
  nextBillingDate: z.string(),
});
const okResponseSchema = z.object({ ok: z.boolean() });

export function usePayments(subscriptionId?: string) {
  const url = subscriptionId
    ? `/api/payments?subscriptionId=${subscriptionId}`
    : "/api/payments";
  return useQuery({
    queryKey: ["payments", subscriptionId ?? "all"],
    queryFn: () => apiFetch(url, paymentsResponseSchema),
    select: (data) => data.payments,
  });
}

export function usePaymentStats() {
  // Pass the client-local YYYY-MM so the "current month" matches the user's
  // wall clock even when the server runs in a different timezone (UTC vs UTC+8).
  const now = new Date();
  const localMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return useQuery({
    queryKey: ["payments", "stats", localMonth],
    queryFn: () => apiFetch(`/api/payments/stats?month=${localMonth}`, statsResponseSchema),
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      subscriptionId: string;
      paidAt: string;
      amount: number;
      currency: string;
      paymentMethod?: string;
      note?: string;
    }) =>
      apiFetch("/api/payments", createResponseSchema, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/payments/${id}`, okResponseSchema, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useQuickRenew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      subscriptionId: string;
      paidAt?: string;
      amount?: number;
      currency?: string;
      paymentMethod?: string;
      note?: string;
    }) =>
      apiFetch(`/api/payments/renew/${data.subscriptionId}`, renewResponseSchema, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

const syncResponseSchema = z.object({
  inserted: z.number(),
  skipped: z.number(),
  subscriptionsConsidered: z.number(),
  inserts: z.array(z.object({ subscriptionId: z.string(), paidAt: z.string() })).optional(),
});

export type SyncFromSubscriptionsResult = z.infer<typeof syncResponseSchema>;

export function useSyncFromSubscriptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { scope: "month" | "year" | "all"; subscriptionIds?: string[] }) => {
      // Send client-local "today" so the upper bound matches the user's wall
      // clock rather than the server's UTC time.
      const now = new Date();
      const todayOverride = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      return apiFetch("/api/payments/sync-from-subscriptions", syncResponseSchema, {
        method: "POST",
        body: JSON.stringify({ ...data, todayOverride }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}
