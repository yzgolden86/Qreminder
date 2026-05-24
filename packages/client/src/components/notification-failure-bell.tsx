/**
 * 失败通知小铃铛。
 *
 * 显示在 Header 上。如果近 7 天有失败的通知任务，铃铛会显示红色数字角标；
 * 点击展开 Popover 列出失败时间和错误原因，便于用户排查渠道配置或外部服务问题。
 */
import { Bell, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRecentNotificationFailures } from "@/hooks/use-notification-failures";
import { useI18n } from "@/i18n/I18nProvider";

export function NotificationFailureBell() {
  const { t } = useI18n();
  const { data } = useRecentNotificationFailures(7);
  const count = data?.count ?? 0;
  const failures = data?.failures ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={t("notifications.failuresLabel", { count })}
        >
          <Bell className={`h-4 w-4 ${count > 0 ? "text-destructive" : ""}`} />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-3">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${count > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          <span className="text-sm font-medium text-foreground">
            {t("notifications.failuresTitle")}
          </span>
        </div>
        {count === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {t("notifications.allHealthy")}
          </p>
        ) : (
          <div className="max-h-[340px] space-y-2 overflow-y-auto">
            {failures.map((f) => (
              <div
                key={f.id}
                className="rounded-md border border-destructive/30 bg-destructive/5 p-2"
              >
                <div className="text-[11px] font-medium text-foreground">
                  {f.scheduledLocalDate} {f.scheduledLocalTime}
                  <span className="ml-1 text-muted-foreground">
                    ({t("notifications.attempts", { count: f.attempts })})
                  </span>
                </div>
                {f.lastError && (
                  <div className="mt-1 text-[10px] text-destructive break-words">
                    {f.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
