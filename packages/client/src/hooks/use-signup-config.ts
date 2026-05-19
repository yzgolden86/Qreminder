import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import {
  signupConfigResponseSchema,
  type SignupConfig,
} from "@/lib/api/schemas/signup-config";

const QUERY_KEY = ["signup-config"];

export function useSignupConfig() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiFetch("/api/app/admin/signup-config", signupConfigResponseSchema).then(
        (r) => r.config,
      ),
  });
}

export function useUpdateSignupConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: SignupConfig) =>
      apiFetch("/api/app/admin/signup-config", signupConfigResponseSchema, {
        method: "PATCH",
        body: JSON.stringify(config),
      }).then((r) => r.config),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
}
