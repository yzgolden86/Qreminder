/**
 * 订阅卡片快捷操作控制器（快速续费/稍后提醒/标记使用/另存为模板）。
 *
 * 架构位置：从 dashboard 页面抽出的 application hook——页面只传 handlers
 * 给 SubscriptionCard，具体 mutation + toast 反馈集中在这里。
 */
import { useQuickRenew } from "@/hooks/use-payments";
import { useSnoozeSubscription, useTrackUsage } from "@/hooks/use-subscriptions";
import { useSaveSubscriptionAsTemplate } from "@/hooks/use-templates";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import type { Subscription } from "@/types/subscription";

/** 卡片下拉菜单里的快捷操作集合。 */
export function useSubscriptionQuickActions(subscriptions: readonly Subscription[]) {
  const { t } = useI18n();
  const quickRenew = useQuickRenew();
  const snoozeSubscription = useSnoozeSubscription();
  const trackUsage = useTrackUsage();
  const saveAsTemplate = useSaveSubscriptionAsTemplate();

  const handleQuickRenew = (id: string) => {
    quickRenew.mutate(
      { subscriptionId: id },
      { onSuccess: () => toast.success(t("payments.quickRenewSuccess")) },
    );
  };

  const handleSnooze = (id: string) => {
    const sub = subscriptions.find((s) => s.id === id);
    const isSnoozed = Boolean(sub?.snoozedUntil);
    // Click while already snoozed = clear (days=0). Otherwise snooze 7 days.
    // A dedicated dialog with day picker is a Phase 2 follow-up.
    snoozeSubscription.mutate(
      { id, days: isSnoozed ? 0 : 7 },
      {
        onSuccess: (res) => {
          if (res.snoozedUntil) {
            toast.success(t("subscription.snoozeUntil", { date: res.snoozedUntil }));
          } else {
            toast.success(t("subscription.snoozeCleared"));
          }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : t("error.generic")),
      },
    );
  };

  const handleTrackUsage = (id: string) => {
    trackUsage.mutate(id, {
      onSuccess: () => toast.success(t("subscription.usageTracked")),
      onError: (err) => toast.error(err instanceof Error ? err.message : t("error.generic")),
    });
  };

  const handleSaveAsTemplate = (id: string) => {
    saveAsTemplate.mutate(
      { subscriptionId: id },
      {
        onSuccess: () => toast.success(t("template.saveSuccess")),
        onError: (err) => toast.error(err instanceof Error ? err.message : t("template.saveFailed")),
      },
    );
  };

  return { handleQuickRenew, handleSnooze, handleTrackUsage, handleSaveAsTemplate };
}
