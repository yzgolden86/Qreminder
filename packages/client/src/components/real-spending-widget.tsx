import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, TrendingUp, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { usePaymentStats } from "@/hooks/use-payments";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

interface RealSpendingWidgetProps {
  estimatedMonthly: number;
}

export function RealSpendingWidget({ estimatedMonthly }: RealSpendingWidgetProps) {
  const { t, formatCurrency } = useI18n();
  const { data: settings } = useSettings();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const { data: stats, isLoading } = usePaymentStats();
  const [view, setView] = useState<"actual" | "estimated">("actual");

  if (isLoading) return null;

  const actualMonth = stats?.monthlySpent ?? 0;
  const actualYear = stats?.yearlySpent ?? 0;
  const monthlyCount = stats?.monthlyCount ?? 0;
  const monthlyByCurrency = stats?.monthlyByCurrency ?? {};
  const currencies = Object.keys(monthlyByCurrency);
  const hasMixedCurrency = currencies.length > 1;

  const monthlyValue = view === "actual" ? actualMonth : estimatedMonthly;
  const variance = actualMonth - estimatedMonthly;
  const variancePercent = estimatedMonthly > 0
    ? ((actualMonth / estimatedMonthly) * 100).toFixed(0)
    : "0";

  return (
    <div className="mb-4 sm:mb-6 surface-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("realSpending.title")}</h3>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
          <button
            type="button"
            onClick={() => setView("actual")}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
              view === "actual"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("realSpending.actual")}
          </button>
          <button
            type="button"
            onClick={() => setView("estimated")}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
              view === "estimated"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("realSpending.estimated")}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
          <div className="mb-1 text-[11px] text-muted-foreground">
            {view === "actual" ? t("realSpending.actualThisMonth") : t("realSpending.estimatedThisMonth")}
          </div>
          <div className="text-xl font-bold text-foreground">
            {formatCurrency(monthlyValue, defaultCurrency)}
          </div>
          {view === "actual" && hasMixedCurrency && (
            <div className="mt-1 flex items-start gap-1 text-[10px] text-warning">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
              <span>{t("realSpending.mixedCurrencyWarning")}</span>
            </div>
          )}
          {view === "actual" && !hasMixedCurrency && estimatedMonthly > 0 && (
            <div className={cn(
              "mt-1 text-[10px] font-medium",
              variance > 0 ? "text-destructive" : "text-success",
            )}>
              {variance > 0 ? "↑" : "↓"} {formatCurrency(Math.abs(variance), defaultCurrency)} ({variancePercent}%)
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
          <div className="mb-1 text-[11px] text-muted-foreground">
            {view === "actual" ? t("realSpending.actualThisYear") : t("realSpending.estimatedThisYear")}
          </div>
          <div className="text-xl font-bold text-foreground">
            {view === "actual"
              ? formatCurrency(actualYear, defaultCurrency)
              : formatCurrency(estimatedMonthly * 12, defaultCurrency)}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {view === "actual" ? t("realSpending.basedOnPayments") : t("realSpending.basedOnCycles")}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 flex items-center justify-between">
          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">{t("realSpending.monthRecords")}</div>
            <div className="text-xl font-bold text-foreground">{monthlyCount}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">{t("realSpending.thisMonthPayments")}</div>
          </div>
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Link to="/payments" aria-label={t("realSpending.viewAll")}>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {view === "actual" && hasMixedCurrency && (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-2.5">
          <p className="mb-1.5 text-[11px] font-medium text-warning">
            {t("realSpending.byCurrencyBreakdown")}
          </p>
          <div className="flex flex-wrap gap-2">
            {currencies.map((cur) => (
              <span
                key={cur}
                className="rounded-md bg-card px-2 py-0.5 text-[11px] text-foreground"
              >
                {formatCurrency(monthlyByCurrency[cur] ?? 0, cur)}
              </span>
            ))}
          </div>
        </div>
      )}

      {view === "actual" && monthlyCount === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t("realSpending.noPaymentsHint")}{" "}
          <Link to="/payments" className="text-primary hover:underline">
            {t("realSpending.recordPayment")}
          </Link>
          {" "}<TrendingUp className="inline h-3 w-3" aria-hidden />
        </p>
      )}
    </div>
  );
}
