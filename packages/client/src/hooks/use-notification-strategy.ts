import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const channelsResponseSchema = z.object({ channels: z.array(z.string()) });
const okResponseSchema = z.object({ ok: z.boolean() });

const templateSchema = z.object({
  id: z.string(),
  user: z.string(),
  scope: z.enum(["global", "channel", "subscription"]),
  scopeId: z.string().nullable().optional(),
  titleTemplate: z.string(),
  bodyTemplate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NotificationTemplate = z.infer<typeof templateSchema>;

const templatesResponseSchema = z.object({ templates: z.array(templateSchema) });
const createResponseSchema = z.object({ id: z.string() });

export function useSubscriptionChannels(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: ["notification-strategy", "channels", subscriptionId],
    queryFn: () =>
      apiFetch(`/api/notification-strategy/channels/${subscriptionId}`, channelsResponseSchema),
    enabled: Boolean(subscriptionId),
    select: (data) => data.channels,
  });
}

export function useSetSubscriptionChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { subscriptionId: string; channels: string[] }) =>
      apiFetch("/api/notification-strategy/channels", okResponseSchema, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({
        queryKey: ["notification-strategy", "channels", variables.subscriptionId],
      });
    },
  });
}

export function useClearSubscriptionChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subscriptionId: string) =>
      apiFetch(`/api/notification-strategy/channels/${subscriptionId}`, okResponseSchema, {
        method: "DELETE",
      }),
    onSuccess: (_, subscriptionId) => {
      void qc.invalidateQueries({
        queryKey: ["notification-strategy", "channels", subscriptionId],
      });
    },
  });
}

export function useNotificationTemplates() {
  return useQuery({
    queryKey: ["notification-strategy", "templates"],
    queryFn: () => apiFetch("/api/notification-strategy/templates", templatesResponseSchema),
    select: (data) => data.templates,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      scope: "global" | "channel" | "subscription";
      scopeId?: string;
      titleTemplate: string;
      bodyTemplate: string;
    }) =>
      apiFetch("/api/notification-strategy/templates", createResponseSchema, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-strategy", "templates"] });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{
      scope: "global" | "channel" | "subscription";
      scopeId: string;
      titleTemplate: string;
      bodyTemplate: string;
    }>) =>
      apiFetch(`/api/notification-strategy/templates/${id}`, okResponseSchema, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-strategy", "templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/notification-strategy/templates/${id}`, okResponseSchema, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-strategy", "templates"] });
    },
  });
}
