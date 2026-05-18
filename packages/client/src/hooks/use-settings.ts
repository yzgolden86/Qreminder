import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_SETTINGS,
  WEBHOOK_HEADERS_PLACEHOLDER,
  WEBHOOK_PAYLOAD_PLACEHOLDER,
  type AppSettings,
} from "@/types/subscription";
import {
  settingsResponseSchema,
  settingsUpdateBodySchema,
} from "@/lib/api/schemas/settings";
import { getSystemTimeZone } from "@/lib/time/time-zone";
import { apiFetch } from "@/lib/api-client";

function clearLegacyWebhookExample(value: string, legacyExample: string) {
  return value.trim() === legacyExample ? "" : value;
}

export function normalizeSettings(value: unknown): AppSettings {
  const parsed = settingsUpdateBodySchema.safeParse(value);
  const defaults = { ...DEFAULT_SETTINGS, timezone: getSystemTimeZone("UTC") };
  if (!parsed.success) return defaults;
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, item]) => item !== undefined),
  ) as Partial<AppSettings>;
  const settings: AppSettings = { ...defaults, ...patch };
  return {
    ...settings,
    webhookHeaders: clearLegacyWebhookExample(settings.webhookHeaders, WEBHOOK_HEADERS_PLACEHOLDER),
    webhookPayload: clearLegacyWebhookExample(settings.webhookPayload, WEBHOOK_PAYLOAD_PLACEHOLDER),
  };
}

const settingsLooseResponseSchema = settingsResponseSchema.extend({
  settings: settingsUpdateBodySchema.passthrough(),
});

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/settings", settingsLooseResponseSchema);
      return normalizeSettings(res.settings);
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const current = queryClient.getQueryData<AppSettings>(["settings"]) ?? DEFAULT_SETTINGS;
      const next = normalizeSettings({ ...current, ...patch });
      const res = await apiFetch("/api/settings", settingsLooseResponseSchema, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      return normalizeSettings(res.settings);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(["settings"], settings);
    },
  });
}
