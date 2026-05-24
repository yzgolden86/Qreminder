/**
 * 通知失败可见性 hook。
 *
 * 用途：dashboard / header 显示最近 N 天发送失败的通知任务数量，让用户能
 * 一眼看出"是否有错过的提醒"。轮询频率 5 分钟一次（页面焦点时），失败
 * 通常源自外部 webhook / 邮件服务的故障，分钟级延迟可以接受。
 */
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";

const failureSchema = z.object({
  id: z.string(),
  scheduledLocalDate: z.string(),
  scheduledLocalTime: z.string(),
  timeZone: z.string(),
  attempts: z.number(),
  lastError: z.string().nullable().optional(),
});

const responseSchema = z.object({
  count: z.number(),
  failures: z.array(failureSchema),
});

export type NotificationFailure = z.infer<typeof failureSchema>;

export function useRecentNotificationFailures(days = 7) {
  return useQuery({
    queryKey: ["notification-failures", days],
    queryFn: () =>
      apiFetch(`/api/app/notifications/recent-failures?days=${days}`, responseSchema),
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
