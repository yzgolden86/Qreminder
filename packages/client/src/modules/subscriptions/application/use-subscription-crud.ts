/**
 * 订阅 CRUD application hook。
 *
 * 架构位置：
 * - React Query hooks 负责远端写入和缓存失效。
 * - 这里只管理页面层的编辑弹窗上下文，避免列表页重复处理编辑态。
 */
import { useState } from "react";
import {
  useCreateSubscription,
  useDeleteSubscription,
  useUpdateSubscription,
} from "@/hooks/use-subscriptions";
import { useSetSubscriptionChannels } from "@/hooks/use-notification-strategy";
import { useMarkTemplateUsed, type SubscriptionTemplate } from "@/hooks/use-templates";
import { useDeferredDialogCleanup } from "@/hooks/use-deferred-dialog-cleanup";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import type { Subscription, SubscriptionDraft } from "@/types/subscription";

/** 订阅 CRUD 的页面级交互控制器。 */
export function useSubscriptionCrud(subscriptions: readonly Subscription[]) {
  const { t } = useI18n();
  const createSubscription = useCreateSubscription();
  const updateSubscription = useUpdateSubscription();
  const deleteSubscription = useDeleteSubscription();
  const setSubscriptionChannels = useSetSubscriptionChannels();
  const markTemplateUsed = useMarkTemplateUsed();
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { scheduleCleanup: scheduleEditCleanup, cancelCleanup: cancelEditCleanup } = useDeferredDialogCleanup(() => {
    setEditingSubscription(null);
  });

  const handleAddSubscription = (
    newSubscription: SubscriptionDraft,
    meta?: { template: SubscriptionTemplate },
  ) => {
    createSubscription.mutate(newSubscription, {
      onSuccess: (created) => {
        if (!meta?.template) return;
        // 模板后置动作是锦上添花：渠道绑定/计数失败不打断创建流程，静默即可。
        if (meta.template.defaultChannels.length > 0) {
          setSubscriptionChannels.mutate({
            subscriptionId: created.id,
            channels: meta.template.defaultChannels,
          });
        }
        markTemplateUsed.mutate(meta.template.id);
      },
    });
  };

  const handleDeleteSubscription = (id: string) => {
    deleteSubscription.mutate(id, {
      onError: (err) => {
        // The optimistic update has already rolled back; surface the failure
        // so the user knows the card came back on purpose.
        toast.error(err instanceof Error ? err.message : t("error.generic"));
      },
    });
  };

  const handleEditSubscription = (id: string) => {
    // 编辑弹窗使用当前列表快照，避免额外请求；列表缓存由 mutations 成功后统一刷新。
    const subscription = subscriptions.find((item) => item.id === id);
    if (!subscription) return;
    cancelEditCleanup();
    setEditingSubscription(subscription);
    setEditDialogOpen(true);
  };

  const handleSaveSubscription = (updatedSubscription: Subscription) => {
    updateSubscription.mutate(updatedSubscription);
  };

  const handleEditDialogOpenChange = (nextOpen: boolean) => {
    setEditDialogOpen(nextOpen);
    if (nextOpen) {
      cancelEditCleanup();
      return;
    }
    scheduleEditCleanup();
  };

  return {
    editingSubscription,
    editDialogOpen,
    setEditDialogOpen,
    handleAddSubscription,
    handleDeleteSubscription,
    handleEditSubscription,
    handleSaveSubscription,
    handleEditDialogOpenChange,
  };
}
