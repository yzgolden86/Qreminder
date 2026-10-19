/**
 * 订阅卡片快捷操作控制器（复制/暂停恢复/快速续费/稍后提醒/标记使用/另存为模板）。
 *
 * 架构位置：从 dashboard 页面抽出的 application hook——页面只传 handlers
 * 给 SubscriptionCard，具体 mutation + toast 反馈集中在这里。
 */
import { useQuickRenew } from "@/hooks/use-payments";
import {
  useCreateSubscription,
  useSnoozeSubscription,
  useTrackUsage,
  useUpdateSubscription,
} from "@/hooks/use-subscriptions";
import { fetchSubscriptionChannels, useSetSubscriptionChannels } from "@/hooks/use-notification-strategy";
import { useSaveSubscriptionAsTemplate } from "@/hooks/use-templates";
import { buildDuplicateDraft } from "@/modules/subscriptions/domain/duplicate-subscription";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { todayDateOnlyInTimeZone } from "@/lib/time/date-only";
import type { Subscription, SubscriptionStatus } from "@/types/subscription";

/** 卡片下拉菜单里的快捷操作集合。 */
export function useSubscriptionQuickActions(
  subscriptions: readonly Subscription[],
  timeZone: string,
) {
  const { t } = useI18n();
  const quickRenew = useQuickRenew();
  const snoozeSubscription = useSnoozeSubscription();
  const trackUsage = useTrackUsage();
  const saveAsTemplate = useSaveSubscriptionAsTemplate();
  const createSubscription = useCreateSubscription();
  const updateSubscription = useUpdateSubscription();
  const setSubscriptionChannels = useSetSubscriptionChannels();

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

  const copyChannels = async (sourceId: string, targetId: string) => {
    try {
      const channels = await fetchSubscriptionChannels(sourceId);
      if (channels.length === 0) return;
      await setSubscriptionChannels.mutateAsync({ subscriptionId: targetId, channels });
    } catch {
      // 渠道复制是加分项：失败时保持静默，避免打断「复制成功」的反馈。
    }
  };

  /**
   * 复制订阅：字段走 buildDuplicateDraft 统一规则，通知渠道在创建成功后
   * 尽力复制。渠道失败不回滚订阅——订阅本身已经建好了。
   */
  const handleDuplicate = (id: string) => {
    const source = subscriptions.find((s) => s.id === id);
    if (!source) return;
    const today = todayDateOnlyInTimeZone(new Date(), timeZone);
    const draft = buildDuplicateDraft(source, {
      today,
      suffix: t("subscription.action.duplicateSuffix"),
    });

    createSubscription.mutate(draft, {
      onSuccess: (created) => {
        toast.success(t("subscription.action.duplicateSuccess", { name: created.name }));
        void copyChannels(source.id, created.id);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : t("error.generic")),
    });
  };

  /** 暂停/恢复：paused 视为暂停，其余状态（active/trial/cancelled）恢复为 active。 */
  const handleToggleStatus = (id: string) => {
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub) return;
    const nextStatus: SubscriptionStatus = sub.status === "paused" ? "active" : "paused";
    updateSubscription.mutate(
      { ...sub, status: nextStatus },
      {
        onSuccess: () =>
          toast.success(
            t(
              nextStatus === "paused"
                ? "subscription.action.pauseSuccess"
                : "subscription.action.resumeSuccess",
              { name: sub.name },
            ),
          ),
        onError: (err) => toast.error(err instanceof Error ? err.message : t("error.generic")),
      },
    );
  };

  return {
    handleQuickRenew,
    handleSnooze,
    handleTrackUsage,
    handleSaveAsTemplate,
    handleDuplicate,
    handleToggleStatus,
  };
}
