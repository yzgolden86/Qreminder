/**
 * 订阅模板 hooks。
 *
 * 模板 = 创建订阅时的预设（分类/标签/渠道/付款方式/周期/提醒档位）。
 * 列表按 usageCount 降序，由服务端排序；创建订阅成功后调 useMarkTemplateUsed
 * 让排序保持有意义。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const templateSchema = z.object({
  id: z.string(),
  user: z.string(),
  name: z.string(),
  category: z.string().nullable().optional().transform((v) => v ?? ""),
  tags: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  defaultChannels: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  paymentMethod: z.string().nullable().optional().transform((v) => v ?? ""),
  billingCycle: z.enum(["weekly", "monthly", "quarterly", "semi-annual", "annual", "custom"]),
  customDays: z.number().nullable().optional(),
  reminderOffsets: z.array(z.number()).nullable().optional().transform((v) => v ?? [3]),
  notes: z.string().nullable().optional().transform((v) => v ?? ""),
  logoUrl: z.string().nullable().optional().transform((v) => v ?? ""),
  usageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SubscriptionTemplate = z.infer<typeof templateSchema>;

const templatesResponseSchema = z.object({ templates: z.array(templateSchema) });
const createResponseSchema = z.object({ id: z.string() });
const okResponseSchema = z.object({ ok: z.boolean() });

export interface TemplateDraft {
  name: string;
  category?: string;
  tags?: string[];
  defaultChannels?: string[];
  paymentMethod?: string;
  billingCycle?: SubscriptionTemplate["billingCycle"];
  customDays?: number | null;
  reminderOffsets?: number[];
  notes?: string;
  logoUrl?: string;
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: () => apiFetch("/api/templates", templatesResponseSchema),
    select: (data) => data.templates,
    staleTime: 60 * 1000,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TemplateDraft) =>
      apiFetch("/api/templates", createResponseSchema, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...draft }: Partial<TemplateDraft> & { id: string }) =>
      apiFetch(`/api/templates/${id}`, okResponseSchema, {
        method: "PATCH",
        body: JSON.stringify(draft),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/templates/${id}`, okResponseSchema, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

/** 把现有订阅另存为模板；name 可覆盖默认（订阅名）。 */
export function useSaveSubscriptionAsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, name }: { subscriptionId: string; name?: string }) =>
      apiFetch(`/api/templates/from-subscription/${subscriptionId}`, createResponseSchema, {
        method: "POST",
        body: JSON.stringify(name ? { name } : {}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}

/** 创建订阅成功后上报模板使用；失败静默（计数不影响主流程）。 */
export function useMarkTemplateUsed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/templates/${id}/use`, okResponseSchema, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
}
