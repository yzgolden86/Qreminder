import { useBudgetUsage } from "@/hooks/use-budgets";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { Target } from "lucide-react";

export function BudgetUsageWidget() {
  const { t, formatCurrency } = useI18n();
  const { data: usage, isLoading } = useBudgetUsage();

  if (isLoading || !usage || usage.length === 0) return null;

  return (
    <div className="mb-4 sm:mb-6">
      <div className="surface-card rounded-xl p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("budget.title")}</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {usage.map((item) => {
            const label = item.scopeType === "global"
              ? t("budget.scopeGlobal")
              : `${item.scopeId || item.scopeType}`;
            const periodLabel = item.period === "monthly"
              ? t("budget.periodMonthly")
              : t("budget.periodYearly");

            return (
              <div key={item.budgetId} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12px] font-medium text-foreground">{label}</span>
                  <span className="text-[10px] text-muted-foreground">{periodLabel}</span>
                </div>
                <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      item.usagePercent >= 100 ? "bg-destructive" :
                      item.usagePercent >= 80 ? "bg-warning" : "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, item.usagePercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {formatCurrency(item.spent, item.currency)} / {formatCurrency(item.budgetAmount, item.currency)}
                  </span>
                  <span className={cn(
                    "font-medium",
                    item.usagePercent >= 100 ? "text-destructive" :
                    item.usagePercent >= 80 ? "text-warning" : "text-muted-foreground",
                  )}>
                    {item.usagePercent}%
                  </span>
                </div>
                {item.overBudget && (
                  <p className="mt-1 text-[10px] font-medium text-destructive">{t("budget.overBudget")}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
