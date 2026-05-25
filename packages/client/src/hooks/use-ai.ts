import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const extractResultSchema = z.object({
  result: z.record(z.string(), z.unknown()),
});

const summaryResultSchema = z.object({
  summary: z.string(),
});

export function useAiExtract() {
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch("/api/ai/extract", extractResultSchema, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
  });
}

export function useAiExtractImage() {
  return useMutation({
    mutationFn: (imageDataUrl: string) =>
      apiFetch("/api/ai/extract-image", extractResultSchema, {
        method: "POST",
        body: JSON.stringify({ imageDataUrl }),
      }),
  });
}

export function useAiSummary() {
  return useMutation({
    mutationFn: () =>
      apiFetch("/api/ai/summary", summaryResultSchema, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });
}
