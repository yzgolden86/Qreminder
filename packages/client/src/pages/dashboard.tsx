import { useState } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { SubscriptionCard } from "@/components/subscription-card";
import { SpendingChart } from "@/components/spending-chart";
import { BillingCycleChart } from "@/components/billing-cycle-chart";
import { MonthlyTop5Chart } from "@/components/monthly-top5-chart";
import { RenewalTop5Chart } from "@/components/renewal-top5-chart";
import { UpcomingRenewalsStrip } from "@/components/upcoming-renewals-strip";
import { AddSubscriptionDialog } from "@/components/add-subscription-dialog";
import { EditSubscriptionDialog } from "@/components/edit-subscription-dialog";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  Category,
  Subscription,
  SubscriptionStatus,
} from "@/types/subscription";
import {
  CreditCard,
  TrendingUp,
  Clock,
  Sparkles,
  Search,
  Filter,
  Plus,
  Grid,
  List as ListIcon,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useDashboardStats } from "@/modules/subscriptions/application/use-dashboard-stats";
import { useSubscriptionCrud } from "@/modules/subscriptions/application/use-subscription-crud";
import { useSubscriptionExport } from "@/modules/subscriptions/application/use-subscription-export";
import { useSubscriptionFilters } from "@/modules/subscriptions/application/use-subscription-filters";
import type { SubscriptionSortOption } from "@/modules/subscriptions/domain/subscription-filters";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";

const EMPTY_SUBSCRIPTIONS: Subscription[] = [];

const SORT_OPTION_LABEL_KEYS: Record<SubscriptionSortOption, MessageKey> = {
  default: "subscriptions.sort.default",
  renewal_asc: "subscriptions.sort.renewalAsc",
  renewal_desc: "subscriptions.sort.renewalDesc",
  monthly_cost_desc: "subscriptions.sort.monthlyCostDesc",
  monthly_cost_asc: "subscriptions.sort.monthlyCostAsc",
  price_desc: "subscriptions.sort.priceDesc",
  price_asc: "subscriptions.sort.priceAsc",
  name_asc: "subscriptions.sort.nameAsc",
  name_desc: "subscriptions.sort.nameDesc",
};

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

  const categoryFilterLabel =
    categoryFilter === "all"
      ? t("subscriptions.allCategories")
      : config.categories.find((category) => category.value === categoryFilter)?.labels
        ? label(
            config.categories.find((category) => category.value === categoryFilter)!.labels,
          )
        : categoryFilter;
  const statusFilterLabel =
    statusFilter === "all"
      ? t("subscriptions.allStatuses")
      : config.statuses.find((status) => status.value === statusFilter)?.labels
        ? label(config.statuses.find((status) => status.value === statusFilter)!.labels)
        : statusFilter;
  const sortOptionLabel = t(SORT_OPTION_LABEL_KEYS[sortOption]);

  if (subscriptionsQuery.isPending || settingsQuery.isPending) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.spendingDistribution")}
            </h3>
            <SpendingChart subscriptions={subscriptions} />
          </div>
          <div className="rounded-lg border border-border bg-card p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.billingCycleDistribution")}
            </h3>
            <BillingCycleChart subscriptions={subscriptions} />
          </div>
          <div className="rounded-lg border border-border bg-card p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.renewalTop5")}
            </h3>
            <RenewalTop5Chart subscriptions={subscriptions} timeZone={timeZone} />
          </div>
          <div className="rounded-lg border border-border bg-card p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("dashboard.monthlyTop5")}
            </h3>
            <MonthlyTop5Chart subscriptions={subscriptions} />
          </div>
        </div>

        <div className="mb-6">
          <UpcomingRenewalsStrip subscriptions={subscriptions} timeZone={timeZone} />
        </div>

        <div className="mb-4 flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="border-border">
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
            >
              {viewMode === "grid" ? (
                <ListIcon className="h-4 w-4" />
              ) : (
                <Grid className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("subscriptions.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-border bg-secondary pl-10"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as Category | "all")}
            >
              <SelectTrigger
                className="w-[140px] border-border bg-secondary"
                tooltipContent={categoryFilterLabel}
              >
                <SelectValue placeholder={t("subscription.field.category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("subscriptions.allCategories")}</SelectItem>
                {config.categories.map((category) => (
                  <SelectItem key={category.id} value={category.value}>
                    {label(category.labels)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as SubscriptionStatus | "all")}
            >
              <SelectTrigger
                className="w-[140px] border-border bg-secondary"
                tooltipContent={statusFilterLabel}
              >
                <SelectValue placeholder={t("subscription.field.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("subscriptions.allStatuses")}</SelectItem>
                {config.statuses.map((status) => (
                  <SelectItem key={status.id} value={status.value}>
                    {label(status.labels)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortOption}
              onValueChange={(v) => setSortOption(v as SubscriptionSortOption)}
            >
              <SelectTrigger
                aria-label={t("subscriptions.sort.label")}
                className="w-[190px] border-border bg-secondary"
                tooltipContent={sortOptionLabel}
              >
                <SelectValue placeholder={t("subscriptions.sort.label")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t("subscriptions.sort.default")}</SelectItem>
                <SelectItem value="renewal_asc">
                  {t("subscriptions.sort.renewalAsc")}
                </SelectItem>
                <SelectItem value="renewal_desc">
                  {t("subscriptions.sort.renewalDesc")}
                </SelectItem>
                <SelectItem value="monthly_cost_desc">
                  {t("subscriptions.sort.monthlyCostDesc")}
                </SelectItem>
                <SelectItem value="monthly_cost_asc">
                  {t("subscriptions.sort.monthlyCostAsc")}
                </SelectItem>
                <SelectItem value="price_desc">{t("subscriptions.sort.priceDesc")}</SelectItem>
                <SelectItem value="price_asc">{t("subscriptions.sort.priceAsc")}</SelectItem>
                <SelectItem value="name_asc">{t("subscriptions.sort.nameAsc")}</SelectItem>
                <SelectItem value="name_desc">{t("subscriptions.sort.nameDesc")}</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveControls && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                {t("subscriptions.clearFilters")}
              </Button>
            )}
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("subscription.field.tags")}:
              </span>
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedTags.includes(tag)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50",
                  )}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {filteredSubscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">
              {t("subscriptions.emptyTitle")}
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {hasActiveFilters
                ? t("subscriptions.emptyFiltered")
                : t("subscriptions.emptyNoData")}
            </p>
            {!hasActiveFilters && (
              <AddSubscriptionDialog
                onAdd={handleAddSubscription}
                trigger={
                  <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow">
                    <Plus className="h-4 w-4" />
                    {t("subscriptions.addFirst")}
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div
            className={cn(
              "grid items-stretch gap-4",
              viewMode === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1",
            )}
          >
            {filteredSubscriptions.map((sub, index) => (
              <div
                key={sub.id}
                className="h-full animate-fade-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <SubscriptionCard
                  subscription={sub}
                  viewMode={viewMode}
                  timeZone={timeZone}
                  onEdit={handleEditSubscription}
                  onDelete={handleDeleteSubscription}
                />
              </div>
            ))}
          </div>
        )}

      <EditSubscriptionDialog
        subscription={editingSubscription}
        open={editDialogOpen}
        onOpenChange={handleEditDialogOpenChange}
        onSave={handleSaveSubscription}
      />
    </>
  );
}
