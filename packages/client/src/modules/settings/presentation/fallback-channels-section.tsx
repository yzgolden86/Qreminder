/**
 * 备用通知渠道（fallback channels）设置面板。
 *
 * 当订阅的主渠道（订阅独立 / 标签默认 / 分类默认 / 全局）全部发送失败时，
 * cron 会再尝试这里配置的备用渠道。典型用法：把 email 作为最后兜底。
 *
 * 存储在 settings.fallbackChannels: string[]。
 */
import { LifeBuoy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NOTIFICATION_CHANNELS, type AppSettings, type NotificationChannel } from "@/types/subscription";
import { useI18n } from "@/i18n/I18nProvider";

interface FallbackChannelsSectionProps {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function FallbackChannelsSection({ settings, updateSetting }: FallbackChannelsSectionProps) {
  const { t } = useI18n();
  const fallback = (settings.fallbackChannels ?? []) as NotificationChannel[];

  const toggle = (channel: NotificationChannel) => {
    const next = fallback.includes(channel)
      ? fallback.filter((c) => c !== channel)
      : [...fallback, channel];
    updateSetting("fallbackChannels" as keyof AppSettings, next as AppSettings[keyof AppSettings]);
  };

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="mb-3 flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">
          {t("fallbackChannels.title")}
        </h2>
      </div>
      <p className="mb-4 text-[12px] text-muted-foreground">
        {t("fallbackChannels.description")}
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-secondary/40 p-3 sm:grid-cols-4">
        {NOTIFICATION_CHANNELS.map((channel) => (
          <Label
            key={channel}
            className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground"
          >
            <Checkbox
              checked={fallback.includes(channel)}
              onCheckedChange={() => toggle(channel)}
            />
            {channel}
          </Label>
        ))}
      </div>
      {fallback.length === 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">{t("fallbackChannels.empty")}</p>
      )}
    </section>
  );
}
