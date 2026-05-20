import { z } from "zod";

export const billingCycleSchema = z.enum([
  "weekly",
  "monthly",
  "quarterly",
  "semi-annual",
  "annual",
  "custom",
]);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

export const subscriptionStatusSchema = z.enum([
  "trial",
  "active",
  "paused",
  "cancelled",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const reminderOffsetsSchema = z
  .array(z.int().min(0).max(365))
  .max(16)
  .transform((values) => Array.from(new Set(values)).sort((a, b) => b - a));

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const subscriptionSchema = z.object({
  id: z.string(),
  user: z.string(),
  name: z.string().min(1).max(120),
  logo: z.string().optional(),
  price: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  billingCycle: billingCycleSchema,
  customDays: z.int().positive().nullable(),
  category: z.string(),
  status: subscriptionStatusSchema,
  paymentMethod: z.string().nullable().optional(),
  startDate: dateOnlySchema,
  nextBillingDate: dateOnlySchema,
  autoCalculateNextBillingDate: z.boolean(),
  trialEndDate: dateOnlySchema.nullable(),
  website: z.url().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).max(20),
  extra: z.record(z.string(), z.unknown()),
  reminderOffsets: reminderOffsetsSchema,
});

export type Subscription = z.infer<typeof subscriptionSchema>;

export const subscriptionDraftSchema = subscriptionSchema.omit({
  id: true,
  user: true,
});
export type SubscriptionDraft = z.infer<typeof subscriptionDraftSchema>;
