import { z } from "zod";

export const signupConfigSchema = z.object({
  enabled: z.boolean(),
  unrestricted: z.boolean(),
  allowedDomains: z.array(z.string()),
});

export const signupConfigResponseSchema = z.object({
  config: signupConfigSchema,
});

export type SignupConfig = z.infer<typeof signupConfigSchema>;
