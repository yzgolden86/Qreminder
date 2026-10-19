import { Search, Filter } from "lucide-react";
import type { RefObject } from "react";
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
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import type { Category, SubscriptionStatus } from "@/types/subscription";
import type { SubscriptionSortOption } from "@/modules/subscriptions/domain/subscription-filters";
import type { MessageKey } from "@/i18n/messages";

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

interface DashboardFilterPanelProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  categoryFilter: Category | "all";
  setCategoryFilter: (v: Category | "all") => void;
  statusFilter: SubscriptionStatus | "all";
  setStatusFilter: (v: SubscriptionStatus | "all") => void;
  sortOption: SubscriptionSortOption;
  setSortOption: (v: SubscriptionSortOption) => void;
  hasActiveControls: boolean;
  clearFilters: () => void;
  allTags: string[];
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  /** 搜索框 ref，供键盘快捷键聚焦。 */
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

export function DashboardFilterPanel({
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  sortOption,
  setSortOption,
  hasActiveControls,
  clearFilters,
  allTags,
  selectedTags,
  toggleTag,
  searchInputRef,
}: DashboardFilterPanelProps) {
  const { t, label } = useI18n();
  const { config } = useCustomConfig();

  const categoryFilterLabel =
    categoryFilter === "all"
      ? t("subscriptions.allCategories")
      : config.categories.find((c) => c.value === categoryFilter)?.labels
        ? label(config.categories.find((c) => c.value === categoryFilter)!.labels)
        : categoryFilter;
  const statusFilterLabel =
    statusFilter === "all"
      ? t("subscriptions.allStatuses")
      : config.statuses.find((s) => s.value === statusFilter)?.labels
        ? label(config.statuses.find((s) => s.value === statusFilter)!.labels)
        : statusFilter;
  const sortOptionLabel = t(SORT_OPTION_LABEL_KEYS[sortOption]);

  return (
    <div className="mb-6 grid gap-4 rounded-xl surface-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder={t("subscriptions.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-border bg-secondary/70 pl-10 pr-10"
          />
          {searchQuery === "" && (
            <kbd
              aria-label={t("subscriptions.searchShortcutHint")}
              className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] leading-none text-muted-foreground sm:block"
            >
              /
            </kbd>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as Category | "all")}
          >
            <SelectTrigger
              className="w-full border-border bg-secondary sm:w-[140px]"
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
              className="w-full border-border bg-secondary sm:w-[140px]"
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
              className="col-span-2 w-full border-border bg-secondary sm:col-span-1 sm:w-[190px]"
              tooltipContent={sortOptionLabel}
            >
              <SelectValue placeholder={t("subscriptions.sort.label")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("subscriptions.sort.default")}</SelectItem>
              <SelectItem value="renewal_asc">{t("subscriptions.sort.renewalAsc")}</SelectItem>
              <SelectItem value="renewal_desc">{t("subscriptions.sort.renewalDesc")}</SelectItem>
              <SelectItem value="monthly_cost_desc">{t("subscriptions.sort.monthlyCostDesc")}</SelectItem>
              <SelectItem value="monthly_cost_asc">{t("subscriptions.sort.monthlyCostAsc")}</SelectItem>
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
              className="col-span-2 text-muted-foreground sm:col-span-1"
            >
              {t("subscriptions.clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {/* Quick Status Segmented Pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-all duration-200",
            statusFilter === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {t("subscriptions.allStatuses")}
        </button>
        {config.statuses.map((status) => {
          const active = statusFilter === status.value;
          return (
            <button
              key={status.id}
              type="button"
              onClick={() => setStatusFilter(status.value as SubscriptionStatus)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {label(status.labels)}
            </button>
          );
        })}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
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
  );
}
