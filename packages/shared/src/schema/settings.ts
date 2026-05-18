import { z } from "zod";

export const notificationChannelSchema = z.enum([
  "telegram",
  "notifyx",
  "webhook",
  "wecom",
  "email",
  "bark",
]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const localeSchema = z.enum(["zh-CN", "en-US"]);
export type Locale = z.infer<typeof localeSchema>;

export const settingsSchema = z.object({
  user: z.string(),
  timezone: z.string().default("Asia/Shanghai"),
  notificationTimeLocal: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("09:00"),
  enabledChannels: z.array(notificationChannelSchema).default([]),
  locale: localeSchema.default("zh-CN"),
  signupEnabled: z.boolean().default(false),
  signupAllowlist: z.array(z.string()).default([]),
  channels: z.record(z.string(), z.unknown()).default({}),
});

export type Settings = z.infer<typeof settingsSchema>;
