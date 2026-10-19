/**
 * 续费日历页（/calendar）。
 *
 * 功能：
 * - 以日历方式展示订阅的 nextBillingDate
 * - 支持从日历点击订阅并进入编辑
 */

import { useState } from 'react';
import type { Subscription } from '@/types/subscription';
import { SubscriptionCalendar } from '@/components/subscription-calendar';
import { EditSubscriptionDialog } from '@/components/edit-subscription-dialog';
import { CalendarSkeleton } from '@/components/loading-skeleton';
import { useSubscriptions, useUpdateSubscription } from '@/hooks/use-subscriptions';
import { useI18n } from '@/i18n/I18nProvider';

const Calendar = () => {
  const subscriptionsQuery = useSubscriptions();
  const subscriptions = subscriptionsQuery.data ?? [];
  const updateSubscription = useUpdateSubscription();
  const { t } = useI18n();
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleEditSubscription = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    setEditDialogOpen(true);
  };

  const handleSaveSubscription = (updated: Subscription) => {
    updateSubscription.mutate(updated);
    setEditDialogOpen(false);
    setEditingSubscription(null);
  };

  if (subscriptionsQuery.isPending) {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] flex-col">
        <div className="mb-4">
          <div className="mb-2 h-7 w-36 rounded bg-muted skeleton-shimmer" />
          <div className="h-4 w-56 rounded bg-muted skeleton-shimmer" />
        </div>
        <CalendarSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("calendar.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("calendar.pageSubtitle")}</p>
        </div>
      </div>

      <SubscriptionCalendar
        subscriptions={subscriptions}
        onEditSubscription={handleEditSubscription}
      />

      <EditSubscriptionDialog
        subscription={editingSubscription}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveSubscription}
      />
    </div>
  );
};

export default Calendar;
