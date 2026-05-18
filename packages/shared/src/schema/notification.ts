import { z } from "zod";

export const notificationJobStatusSchema = z.enum([
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
]);
export type NotificationJobStatus = z.infer<typeof notificationJobStatusSchema>;

export const notificationHitSchema = z.object({
  subscriptionId: z.string(),
  subscriptionName: z.string(),
  daysUntil: z.int(),
  matchedOffset: z.int().nonnegative(),
  kind: z.enum(["renewal", "trial"]),
});
export type NotificationHit = z.infer<typeof notificationHitSchema>;

export const notificationJobSchema = z.object({
  id: z.string(),
  user: z.string(),
  scheduledLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string(),
  status: notificationJobStatusSchema,
  attempts: z.int().min(0),
  lastError: z.string().nullable(),
  hits: z.array(notificationHitSchema),
});
export type NotificationJob = z.infer<typeof notificationJobSchema>;
