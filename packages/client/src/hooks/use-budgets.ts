import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const budgetSchema = z.object({
  id: z.string(),
  user: z.string(),
  scopeType: z.enum(["global", "category", "tag", "payment_method"]),
  scopeId: z.string().nullable().optional(),
  period: z.enum(["monthly", "yearly"]),
  amount: z.number(),
  currency: z.string(),
  enabled: z.union([z.boolean(), z.number()]).transform((v) => Boolean(v)),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Budget = z.infer<typeof budgetSchema>;

const budgetsResponseSchema = z.object({ budgets: z.array(budgetSchema) });

const budgetUsageItemSchema = z.object({
  budgetId: z.string(),
  scopeType: z.string(),
  scopeId: z.string().nullable().optional(),
  period: z.string(),
  budgetAmount: z.number(),
  currency: z.string(),
  spent: z.number(),
  usagePercent: z.number(),
  overBudget: z.boolean(),
});

export type BudgetUsage = z.infer<typeof budgetUsageItemSchema>;

const usageResponseSchema = z.object({ usage: z.array(budgetUsageItemSchema) });
const createResponseSchema = z.object({ id: z.string() });
const okResponseSchema = z.object({ ok: z.boolean() });

export function useBudgets() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: () => apiFetch("/api/budgets", budgetsResponseSchema),
    select: (data) => data.budgets,
  });
}

export function useBudgetUsage() {
  return useQuery({
    queryKey: ["budgets", "usage"],
    queryFn: () => apiFetch("/api/budgets/usage", usageResponseSchema),
    select: (data) => data.usage,
  });
}

export interface CreateBudgetInput {
  scopeType: "global" | "category" | "tag" | "payment_method";
  scopeId?: string;
  period: "monthly" | "yearly";
  amount: number;
  currency: string;
  enabled?: boolean;
}

export function useCreateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBudgetInput) =>
      apiFetch("/api/budgets", createResponseSchema, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CreateBudgetInput> & { id: string }) =>
      apiFetch(`/api/budgets/${id}`, okResponseSchema, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/budgets/${id}`, okResponseSchema, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}
