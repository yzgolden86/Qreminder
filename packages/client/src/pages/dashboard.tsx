import { useMemo, useState } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { SubscriptionCard } from "@/components/subscription-card";
import { SpendingChart } from "@/components/spending-chart";
import { BillingCycleChart } from "@/components/billing-cycle-chart";
import { MonthlyTop5Chart } from "@/components/monthly-top5-chart";
import { RenewalTop5Chart } from "@/components/renewal-top5-chart";
import { UpcomingRenewalsStrip } from "@/components/upcoming-renewals-strip";
import { BudgetUsageWidget } from "@/components/budget-usage-widget";
import { RealSpendingWidget } from "@/components/real-spending-widget";
import { MonthlyCompletionWidget } from "@/components/monthly-completion-widget";
import { InactiveSubscriptionsPanel } from "@/components/inactive-subscriptions-panel";
import { InsightsPanel } from "@/components/insights-panel";
import { AddSubscriptionDialog } from "@/components/add-subscription-dialog";
import { EditSubscriptionDialog } from "@/components/edit-subscription-dialog";
import { AiExtractDialog } from "@/components/ai-extract-dialog";
import { AiSummaryWidget } from "@/components/ai-summary-widget";
import { SubscriptionChannelsDialog } from "@/components/subscription-channels-dialog";
import { BulkChannelsDialog } from "@/components/bulk-channels-dialog";
import { DashboardFilterPanel } from "@/components/dashboard-filter-panel";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Subscription, SubscriptionStatus } from "@/types/subscription";
import {
  CreditCard,
  TrendingUp,
  Clock,
  Sparkles,
  Search,
  Plus,
  Grid,
  List as ListIcon,
  Download,
  CheckSquare,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSubscriptions, useBatchDeleteSubscriptions, useBatchUpdateSubscriptions } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useQuickRenew } from "@/hooks/use-payments";
import { useSnoozeSubscription, useTrackUsage } from "@/hooks/use-subscriptions";
import { useDashboardStats } from "@/modules/subscriptions/application/use-dashboard-stats";
import { useSubscriptionCrud } from "@/modules/subscriptions/application/use-subscription-crud";
import { useSubscriptionExport } from "@/modules/subscriptions/application/use-subscription-export";
import { useSubscriptionFilters } from "@/modules/subscriptions/application/use-subscription-filters";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { useI18n } from "@/i18n/I18nProvider";

const EMPTY_SUBSCRIPTIONS: Subscription[] = [];

export default function Home() {
  const subscriptionsQuery = useSubscriptions();
  const subscriptions = subscriptionsQuery.data ?? EMPTY_SUBSCRIPTIONS;
  const settingsQuery = useSettings();
  const settings = settingsQuery.data;
  const { config } = useCustomConfig();
  const { t, label, locale, formatCurrency } = useI18n();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const exchangeRateProvider = settings?.exchangeRateProvider;
  const { convert, loading: ratesLoading } = useExchangeRates(exchangeRateProvider);
  const timeZone = settings?.timezone ?? "UTC";
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [bulkChannelsDialogOpen, setBulkChannelsDialogOpen] = useState(false);
  const [channelsDialogSubId, setChannelsDialogSubId] = useState<string | null>(null);
  const batchDelete = useBatchDeleteSubscriptions();
  const batchUpdate = useBatchUpdateSubscriptions();
  const quickRenew = useQuickRenew();
  const snoozeSubscription = useSnoozeSubscription();
  const trackUsage = useTrackUsage();

  const { activeSubscriptions, totalMonthly, upcomingCount, trialCount } =
    useDashboardStats(subscriptions, defaultCurrency, convert, timeZone);

  const {
    editingSubscription,
    editDialogOpen,
    handleAddSubscription,
    handleDeleteSubscription,
    handleEditSubscription,
    handleSaveSubscription,
    handleEditDialogOpenChange,
  } = useSubscriptionCrud(subscriptions);

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

  const {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    sortOption,
    setSortOption,
    selectedTags,
    allTags,
    filteredSubscriptions,
    hasActiveFilters,
    hasActiveControls,
    toggleTag,
    clearFilters,
  } = useSubscriptionFilters(subscriptions, { defaultCurrency, convert, locale });

  const { exportToJSON, exportToCSV } = useSubscriptionExport(
    filteredSubscriptions,
    config,
    locale,
  );

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredSubscriptions.map((s) => s.id)));
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const selectedSubscriptions = useMemo(
    () => subscriptions.filter((s) => selectedIds.has(s.id)),
    [subscriptions, selectedIds],
  );

  const handleBatchDelete = async () => {
    try {
      await batchDelete.mutateAsync([...selectedIds]);
      toast.success(t("subscriptions.batchSelected", { count: selectedIds.size }));
      exitBatchMode();
    } catch {
      toast.error(t("error.generic"));
    }
    setBatchDeleteDialogOpen(false);
  };

  const handleBatchStatusChange = async (status: SubscriptionStatus) => {
    const updates = selectedSubscriptions.map((s) => ({ subscription: s, patch: { status } }));
    try {
      await batchUpdate.mutateAsync(updates);
      toast.success(t("subscriptions.batchSelected", { count: selectedIds.size }));
      exitBatchMode();
    } catch {
      toast.error(t("error.generic"));
    }
  };

  const handleBatchCategoryChange = async (category: string) => {
    const updates = selectedSubscriptions.map((s) => ({ subscription: s, patch: { category } }));
    try {
      await batchUpdate.mutateAsync(updates);
      toast.success(t("subscriptions.batchSelected", { count: selectedIds.size }));
      exitBatchMode();
    } catch {
      toast.error(t("error.generic"));
    }
  };

  if (subscriptionsQuery.isPending || settingsQuery.isPending) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <div className="mb-4 grid gap-3 sm:mb-6 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title={t("dashboard.monthlySpend")}
            value={formatCurrency(totalMonthly, defaultCurrency)}
            subtitle={
              ratesLoading
                ? t("dashboard.ratesLoading")
                : t("dashboard.realTimeRates", { currency: defaultCurrency })
            }
            icon={<CreditCard className="h-6 w-6" />}
            variant="primary"
            className="animate-fade-in"
          />
          <StatCard
            title={t("dashboard.activeSubscriptions")}
            value={activeSubscriptions.length}
            subtitle={t("dashboard.totalSubscriptions", { count: subscriptions.length })}
            icon={<TrendingUp className="h-6 w-6" />}
            className="animate-fade-in [animation-delay:100ms]"
          />
          <StatCard
            title={t("dashboard.upcomingRenewals")}
            value={upcomingCount}
            subtitle={t("dashboard.next7Days")}
            icon={<Clock className="h-6 w-6" />}
            variant={upcomingCount > 0 ? "warning" : "default"}
            className="animate-fade-in [animation-delay:200ms]"
          />
          <StatCard
            title={t("dashboard.trials")}
            value={trialCount}
            subtitle={t("dashboard.trialsNeedAttention")}
            icon={<Sparkles className="h-6 w-6" />}
            variant={trialCount > 0 ? "warning" : "default"}
            className="animate-fade-in [animation-delay:300ms]"
          />
        </div>

        <div className="mb-4 grid gap-3 sm:mb-6 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="surface-card lift-on-hover rounded-xl p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.spendingDistribution")}
            </h3>
            <SpendingChart subscriptions={subscriptions} />
          </div>
          <div className="surface-card lift-on-hover rounded-xl p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.billingCycleDistribution")}
            </h3>
            <BillingCycleChart subscriptions={subscriptions} />
          </div>
          <div className="surface-card lift-on-hover rounded-xl p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.renewalTop5")}
            </h3>
            <RenewalTop5Chart subscriptions={subscriptions} timeZone={timeZone} />
          </div>
          <div className="surface-card lift-on-hover rounded-xl p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.monthlyTop5")}
            </h3>
            <MonthlyTop5Chart subscriptions={subscriptions} />
          </div>
        </div>

        <BudgetUsageWidget />

        <MonthlyCompletionWidget />

        <InactiveSubscriptionsPanel />

        <InsightsPanel />

        <RealSpendingWidget estimatedMonthly={totalMonthly} />

        <AiSummaryWidget />

        <div className="mb-4 sm:mb-6">
          <UpcomingRenewalsStrip subscriptions={subscriptions} timeZone={timeZone} />
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("subscriptions.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subscriptions.count", { count: filteredSubscriptions.length })}
              {hasActiveFilters &&
                ` ${t("subscriptions.filteredCount", { count: subscriptions.length })}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!batchMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchMode(true)}
                className="gap-1.5"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("subscriptions.batchSelect")}</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={exitBatchMode}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("subscriptions.batchCancel")}</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="border-border" aria-label={t("subscriptions.exportJson")}>
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToJSON}>
                  {t("subscriptions.exportJson")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToCSV}>
                  {t("subscriptions.exportCsv")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              className="border-border"
              aria-label={viewMode === "grid" ? "List view" : "Grid view"}
            >
              {viewMode === "grid" ? (
                <ListIcon className="h-4 w-4" />
              ) : (
                <Grid className="h-4 w-4" />
              )}
            </Button>
            <AddSubscriptionDialog
              onAdd={handleAddSubscription}
              trigger={
                <Button className="gap-2 bg-primary text-primary-foreground shadow-sm hover:bg-primary-glow hover:shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.4)] transition-all">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("subscription.add")}</span>
                </Button>
              }
            />
            <AiExtractDialog onAdd={handleAddSubscription} />
          </div>
        </div>

        <DashboardFilterPanel
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortOption={sortOption}
          setSortOption={setSortOption}
          hasActiveControls={hasActiveControls}
          clearFilters={clearFilters}
          allTags={allTags}
          selectedTags={selectedTags}
          toggleTag={toggleTag}
        />

        {filteredSubscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center sm:py-20">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full bg-primary/15 blur-xl" aria-hidden />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
                <Search className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <h3 className="mb-1.5 text-lg font-semibold tracking-tight text-foreground">
              {t("subscriptions.emptyTitle")}
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              {hasActiveFilters
                ? t("subscriptions.emptyFiltered")
                : t("subscriptions.emptyNoData")}
            </p>
            {!hasActiveFilters && (
              <AddSubscriptionDialog
                onAdd={handleAddSubscription}
                trigger={
                  <Button className="group gap-2 bg-primary text-primary-foreground shadow-primary hover:bg-primary-glow hover:shadow-[0_16px_40px_-8px_hsl(var(--primary)/0.45)]">
                    <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
                    {t("subscriptions.addFirst")}
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div
            className={cn(
              "grid items-stretch gap-3 sm:gap-4",
              viewMode === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1",
            )}
          >
            {filteredSubscriptions.map((sub, index) => (
              <div
                key={sub.id}
                className={cn(
                  "relative h-full animate-fade-in",
                  batchMode && selectedIds.has(sub.id) && "ring-2 ring-primary rounded-lg",
                )}
                style={{ animationDelay: `${index * 30}ms` }}
                onClick={batchMode ? () => toggleSelection(sub.id) : undefined}
              >
                {batchMode && (
                  <div
                    className="absolute right-2.5 bottom-2.5 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds.has(sub.id)}
                      onCheckedChange={() => toggleSelection(sub.id)}
                      aria-label={`Select ${sub.name}`}
                      className="h-5 w-5 rounded-md border-2 border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary shadow-sm"
                    />
                  </div>
                )}
                <SubscriptionCard
                  subscription={sub}
                  viewMode={viewMode}
                  timeZone={timeZone}
                  {...(!batchMode && {
                    onEdit: handleEditSubscription,
                    onDelete: handleDeleteSubscription,
                    onRenew: handleQuickRenew,
                    onConfigureChannels: setChannelsDialogSubId,
                    onSnooze: handleSnooze,
                    onTrackUsage: handleTrackUsage,
                  })}
                />
              </div>
            ))}
          </div>
        )}

      {batchMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-foreground">
                {t("subscriptions.batchSelected", { count: selectedIds.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-[12px]">
                {t("subscriptions.batchSelectAll")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    {t("subscriptions.batchChangeStatus")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {config.statuses.map((status) => (
                    <DropdownMenuItem
                      key={status.id}
                      onClick={() => void handleBatchStatusChange(status.value as SubscriptionStatus)}
                    >
                      {label(status.labels)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    {t("subscriptions.batchChangeCategory")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {config.categories.map((cat) => (
                    <DropdownMenuItem
                      key={cat.id}
                      onClick={() => void handleBatchCategoryChange(cat.value)}
                    >
                      {label(cat.labels)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setBatchDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("subscriptions.batchDelete")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setBulkChannelsDialogOpen(true)}
              >
                {t("subscriptions.batchChannels")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BulkChannelsDialog
        open={bulkChannelsDialogOpen}
        onOpenChange={setBulkChannelsDialogOpen}
        subscriptionIds={[...selectedIds]}
        onSuccess={exitBatchMode}
      />

      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("subscriptions.batchDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("subscriptions.batchDeleteDescription", { count: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleBatchDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditSubscriptionDialog
        subscription={editingSubscription}
        open={editDialogOpen}
        onOpenChange={handleEditDialogOpenChange}
        onSave={handleSaveSubscription}
      />

      <SubscriptionChannelsDialog
        subscriptionId={channelsDialogSubId}
        subscriptionName={
          channelsDialogSubId
            ? subscriptions.find((s) => s.id === channelsDialogSubId)?.name
            : undefined
        }
        open={channelsDialogSubId !== null}
        onOpenChange={(open) => !open && setChannelsDialogSubId(null)}
      />
    </>
  );
}
