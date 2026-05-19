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
      <div>
        <div className="mb-6">
          <div className="h-8 w-32 bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </div>
        <CalendarSkeleton />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("calendar.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("calendar.pageSubtitle")}</p>
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
    </>
  );
};

export default Calendar;
