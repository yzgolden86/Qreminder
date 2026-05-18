import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_CUSTOM_CONFIG, normalizePaymentMethods, type ConfigItem, type CustomConfig } from "@/types/config";
import { normalizeCustomConfig } from "../domain/normalize-custom-config";

const LOCAL_STORAGE_KEY = "qreminder_custom_config";

const customConfigResponseSchema = z
  .object({
    config: z.unknown(),
  })
  .passthrough();

export function useCustomConfigState() {
  const [config, setConfig] = useState<CustomConfig>(DEFAULT_CUSTOM_CONFIG);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  const { data: remoteConfig } = useQuery<CustomConfig | null>({
    queryKey: ["custom-config", userId],
    queryFn: async () => {
      if (!userId) return null;
      try {
        const res = await apiFetch("/api/custom-configs", customConfigResponseSchema);
        return normalizeCustomConfig(res.config);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (nextConfig: CustomConfig) => {
      if (!userId) return;
      await apiFetch("/api/custom-configs", customConfigResponseSchema, {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
    },
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        setConfig(normalizeCustomConfig(JSON.parse(saved)));
      }
    } catch (e) {
      console.error("Failed to load custom config:", e);
    }
  }, []);

  useEffect(() => {
    if (!remoteConfig) return;
    setConfig(remoteConfig);
  }, [remoteConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.error("Failed to save custom config:", e);
    }
  }, [config]);

  const scheduleRemoteSave = useCallback(
    (nextConfig: CustomConfig) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveMutation.mutate(nextConfig);
      }, 500);
    },
    [saveMutation],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateConfig = useCallback(
    (updater: (prev: CustomConfig) => CustomConfig) => {
      setConfig((prev) => {
        const next = updater(prev);
        scheduleRemoteSave(next);
        return next;
      });
    },
    [scheduleRemoteSave],
  );

  const updateCategories = useCallback(
    (items: ConfigItem[]) => {
      updateConfig((prev) => ({ ...prev, categories: items }));
    },
    [updateConfig],
  );

  const updateStatuses = useCallback(
    (items: ConfigItem[]) => {
      updateConfig((prev) => ({ ...prev, statuses: items }));
    },
    [updateConfig],
  );

  const updatePaymentMethods = useCallback(
    (items: ConfigItem[]) => {
      updateConfig((prev) => ({ ...prev, paymentMethods: normalizePaymentMethods(items) }));
    },
    [updateConfig],
  );

  const updateCurrencies = useCallback(
    (items: ConfigItem[]) => {
      updateConfig((prev) => ({ ...prev, currencies: items }));
    },
    [updateConfig],
  );

  const saveConfig = useCallback(
    async (nextConfig: CustomConfig) => {
      const normalized = normalizeCustomConfig(nextConfig);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await saveMutation.mutateAsync(normalized);
      setConfig(normalized);
      return normalized;
    },
    [saveMutation],
  );

  return {
    config,
    updateCategories,
    updateStatuses,
    updatePaymentMethods,
    updateCurrencies,
    saveConfig,
  };
}
