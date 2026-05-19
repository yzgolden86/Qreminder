import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const signupStatusSchema = z.object({ enabled: z.boolean() });

export function useSignupStatus() {
  return useQuery({
    queryKey: ["signup-status"],
    queryFn: () =>
      apiFetch("/api/app/signup-status", signupStatusSchema).then((r) => r.enabled),
    staleTime: 5 * 60 * 1000,
  });
}
