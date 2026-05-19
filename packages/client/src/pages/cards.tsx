import { useMemo, useState } from "react";
import { CreditCard, Layers, Wallet, ChevronRight } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthorizedImage } from "@/components/authorized-image";
import { SubscriptionCard } from "@/components/subscription-card";
import { EditSubscriptionDialog } from "@/components/edit-subscription-dialog";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { useI18n } from "@/i18n/I18nProvider";
import { useSubscriptionCrud } from "@/modules/subscriptions/application/use-subscription-crud";
import { usePaymentCards } from "@/modules/subscriptions/application/use-payment-cards";
import {
  UNSPECIFIED_PAYMENT_KEY,
  type PaymentCardGroup,
} from "@/modules/subscriptions/domain/payment-cards-model";
import { isBuiltInPaymentMethodValue } from "@/types/config";
import type { Subscription } from "@/types/subscription";
import { cn } from "@/lib/utils";

const EMPTY_SUBSCRIPTIONS: Subscription[] = [];
const MAX_PREVIEW_SUBSCRIPTIONS = 4;

export default function Cards() {
  const subscriptionsQuery = useSubscriptions();
  const subscriptions = subscriptionsQuery.data ?? EMPTY_SUBSCRIPTIONS;
  const settingsQuery = useSettings();
  const settings = settingsQuery.data;
  const { config } = useCustomConfig();
  const { t, label, formatCurrency } = useI18n();

  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const { convert } = useExchangeRates(settings?.exchangeRateProvider);
  const timeZone = settings?.timezone ?? "UTC";

  const cardsModel = usePaymentCards(subscriptions, config, defaultCurrency, convert);

  const {
    editingSubscription,
    editDialogOpen,
    handleDeleteSubscription,
    handleEditSubscription,
    handleSaveSubscription,
    handleEditDialogOpenChange,
  } = useSubscriptionCrud(subscriptions);

  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  const activeGroup = useMemo(
    () => (activeGroupKey ? cardsModel.groups.find((g) => g.key === activeGroupKey) ?? null : null),
    [activeGroupKey, cardsModel.groups],
  );

  if (subscriptionsQuery.isPending || settingsQuery.isPending) {
    return <DashboardSkeleton />;
  }

  const renderGroupTitle = (group: PaymentCardGroup): string => {
    if (group.method) return label(group.method.labels);
    return t("cards.unspecified");
  };

  const renderGroupIcon = (group: PaymentCardGroup) => {
    if (group.method?.icon) {
      return (
        <AuthorizedImage
          src={group.method.icon}
          alt=""
          className="h-7 w-7 object-contain"
        />
      );
    }
    return <CreditCard className="h-6 w-6 text-muted-foreground" />;
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("nav.cards")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("cards.subtitle")}</p>
      </div>

      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        <StatCard
          title={t("cards.statTotalMethods")}
          value={cardsModel.totalMethods}
          icon={<Wallet className="h-6 w-6" />}
          variant="primary"
          className="animate-fade-in"
        />
        <StatCard
          title={t("cards.statTotalSubscriptions")}
          value={cardsModel.totalSubscriptions}
          icon={<Layers className="h-6 w-6" />}
          className="animate-fade-in [animation-delay:100ms]"
        />
        <StatCard
          title={t("cards.statTotalMonthly")}
          value={formatCurrency(cardsModel.totalMonthly, defaultCurrency)}
          icon={<CreditCard className="h-6 w-6" />}
          className="animate-fade-in [animation-delay:200ms]"
        />
      </div>

      {cardsModel.groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-foreground">
            {t("cards.emptyTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("cards.emptyDescription")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cardsModel.groups.map((group, index) => {
            const isUnspecified = group.key === UNSPECIFIED_PAYMENT_KEY;
            const previewSubs = group.subscriptions.slice(0, MAX_PREVIEW_SUBSCRIPTIONS);
            const overflowCount = group.subscriptions.length - previewSubs.length;
            const sharePercentLabel = Math.round(group.shareOfTotalPercent);
            const isBuiltIn =
              group.method !== null && isBuiltInPaymentMethodValue(group.method.value);

            return (
              <button
                key={group.key}
                type="button"
                onClick={() => setActiveGroupKey(group.key)}
                className={cn(
                  "group flex animate-fade-in flex-col gap-4 rounded-xl border border-border bg-card p-5 text-left shadow-card transition-all hover:bg-card-hover hover:border-primary/40",
                  isUnspecified && "border-dashed",
                )}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                        isUnspecified ? "bg-muted" : "bg-secondary",
                      )}
                    >
                      {renderGroupIcon(group)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {renderGroupTitle(group)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("cards.subscriptionCount", { count: group.subscriptions.length })}
                      </p>
                    </div>
                  </div>
                  {isBuiltIn && (
                    <Badge variant="outline" className="border-border text-[10px] uppercase tracking-wide">
                      {t("cards.builtInBadge")}
                    </Badge>
                  )}
                </div>

                <div>
                  <p className="text-2xl font-bold tracking-tight text-foreground">
                    {formatCurrency(group.monthly, defaultCurrency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("cards.shareOfTotal", { percent: sharePercentLabel })}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        isUnspecified ? "bg-muted-foreground/50" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, group.shareOfTotalPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  {previewSubs.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-secondary/40 px-3 py-1.5 text-xs"
                    >
                      <span className="truncate text-foreground">{sub.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatCurrency(sub.price, sub.currency)}
                      </span>
                    </div>
                  ))}
                  {overflowCount > 0 && (
                    <p className="text-center text-xs text-muted-foreground">
                      {t("cards.viewMore", { count: overflowCount })}
                    </p>
                  )}
                </div>

                {isUnspecified && (
                  <p className="text-xs text-muted-foreground">{t("cards.unspecifiedHint")}</p>
                )}

                <div className="mt-auto flex items-center justify-end text-xs text-muted-foreground transition-colors group-hover:text-primary">
                  <ChevronRight className="h-4 w-4" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog
        open={activeGroup !== null}
        onOpenChange={(open) => {
          if (!open) setActiveGroupKey(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {activeGroup && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                    {renderGroupIcon(activeGroup)}
                  </div>
                  <div className="text-left">
                    <p className="text-base font-semibold text-foreground">
                      {renderGroupTitle(activeGroup)}
                    </p>
                    <p className="text-xs font-normal text-muted-foreground">
                      {t("cards.subscriptionCount", { count: activeGroup.subscriptions.length })}
                      {" · "}
                      {formatCurrency(activeGroup.monthly, defaultCurrency)}
                    </p>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="mt-2 grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
                {activeGroup.subscriptions.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    subscription={sub}
                    viewMode="list"
                    timeZone={timeZone}
                    onEdit={(id) => {
                      setActiveGroupKey(null);
                      handleEditSubscription(id);
                    }}
                    onDelete={handleDeleteSubscription}
                  />
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={() => setActiveGroupKey(null)}>
                  {t("common.close")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <EditSubscriptionDialog
        subscription={editingSubscription}
        open={editDialogOpen}
        onOpenChange={handleEditDialogOpenChange}
        onSave={handleSaveSubscription}
      />
    </>
  );
}
