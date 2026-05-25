/**
 * 年度财报页 — `/annual-report?year=YYYY`
 *
 * Wrapped 风格的可分享页面：年度花费、月份分布、Top 5、分类、同比。
 * 多币种走前端 convert 折算到默认币种以便聚合显示。
 */
import { useMemo, useState } from "react";
import { Calendar, TrendingUp, TrendingDown, Trophy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnnualReport } from "@/hooks/use-annual-report";
import { useSettings } from "@/hooks/use-settings";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useI18n } from "@/i18n/I18nProvider";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { cn } from "@/lib/utils";

export default function AnnualReportPage() {
  const { t, formatCurrency, label } = useI18n();
  const { data: settings } = useSettings();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const { convert } = useExchangeRates();
  const { config } = useCustomConfig();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: report, isLoading } = useAnnualReport(year);

  const convertedTotal = useMemo(() => {
    if (!report) return 0;
    return Object.entries(report.totalByCurrency).reduce(
      (sum, [cur, amount]) => sum + convert(amount, cur, defaultCurrency),
      0,
    );
  }, [report, convert, defaultCurrency]);

  const previousYearConverted = useMemo(() => {
    // Server-side previousYearTotal is the raw sum (no currency conversion).
    // For the YoY headline we re-convert assuming the same currency mix as
    // this year (rough but better than nothing). Future improvement: server
    // returns previousYearByCurrency too.
    if (!report || report.yoy.previousYearTotal === 0) return 0;
    if (!report.totalSpent || report.totalSpent === 0) return report.yoy.previousYearTotal;
    return report.yoy.previousYearTotal * (convertedTotal / report.totalSpent);
  }, [report, convertedTotal]);

  const monthlyMax = useMemo(() => {
    if (!report) return 1;
    return Math.max(1, ...report.monthly.map((m) => m.total));
  }, [report]);

  if (isLoading || !report) {
    return (
      <div className="surface-card rounded-xl p-12 text-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  const yoyChange = report.yoy.changePercent;
  const yoyTrend: "up" | "down" | "flat" = yoyChange === null
    ? "flat"
    : yoyChange > 0
      ? "up"
      : yoyChange < 0
        ? "down"
        : "flat";

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("annualReport.title", { year })}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("annualReport.subtitle")}</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-secondary/50 p-1">
          {[currentYear - 1, currentYear].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                year === y
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:gap-5 sm:grid-cols-3">
        <div className="surface-card rounded-xl p-4 sm:p-5">
          <div className="mb-1 text-[11px] text-muted-foreground">{t("annualReport.totalSpent")}</div>
          <div className="text-2xl font-bold text-foreground">
            {formatCurrency(convertedTotal, defaultCurrency)}
          </div>
          {Object.keys(report.totalByCurrency).length > 1 && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t("realSpending.convertedFrom", { count: Object.keys(report.totalByCurrency).length })}
            </div>
          )}
        </div>
        <div className="surface-card rounded-xl p-4 sm:p-5">
          <div className="mb-1 text-[11px] text-muted-foreground">{t("annualReport.paymentCount")}</div>
          <div className="text-2xl font-bold text-foreground">{report.paymentCount}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">{t("annualReport.payments")}</div>
        </div>
        <div className="surface-card rounded-xl p-4 sm:p-5">
          <div className="mb-1 text-[11px] text-muted-foreground">{t("annualReport.yoy")}</div>
          <div className="flex items-center gap-1">
            {yoyTrend === "up" && <TrendingUp className="h-5 w-5 text-destructive" />}
            {yoyTrend === "down" && <TrendingDown className="h-5 w-5 text-success" />}
            <span
              className={cn(
                "text-2xl font-bold",
                yoyTrend === "up" && "text-destructive",
                yoyTrend === "down" && "text-success",
                yoyTrend === "flat" && "text-foreground",
              )}
            >
              {yoyChange === null
                ? "—"
                : `${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(1)}%`}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {yoyChange === null
              ? t("annualReport.noPriorYear")
              : t("annualReport.vsPriorYear", { amount: formatCurrency(previousYearConverted, defaultCurrency) })}
          </div>
        </div>
      </div>

      <div className="mb-5 surface-card rounded-xl p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("annualReport.monthlyDistribution")}</h3>
        </div>
        <div className="grid grid-cols-12 gap-1 h-32 items-end">
          {report.monthly.map((m) => {
            const heightPct = monthlyMax > 0 ? (m.total / monthlyMax) * 100 : 0;
            return (
              <div key={m.month} className="flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-primary/70"
                  style={{ height: `${heightPct}%` }}
                  title={`${m.month}: ${formatCurrency(m.total, defaultCurrency)}`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {m.month.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
        <div className="surface-card rounded-xl p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-foreground">{t("annualReport.topSubscriptions")}</h3>
          </div>
          {report.topSubscriptions.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{t("annualReport.noData")}</p>
          ) : (
            <ol className="space-y-2">
              {report.topSubscriptions.map((sub, idx) => (
                <li
                  key={`${sub.name}-${idx}`}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/20 p-2.5"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/20 text-[11px] font-bold text-warning">
                      {idx + 1}
                    </span>
                    <span className="text-[13px] font-medium text-foreground">{sub.name}</span>
                  </span>
                  <span className="text-[12px] font-semibold text-foreground">
                    {formatCurrency(sub.amount, sub.currency)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="surface-card rounded-xl p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t("annualReport.byCategory")}</h3>
          {Object.keys(report.byCategory).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{t("annualReport.noData")}</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(report.byCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amount]) => {
                  const ratio = report.totalSpent > 0 ? amount / report.totalSpent : 0;
                  const catConfig = config.categories.find((c) => c.value === cat);
                  const catLabel = catConfig ? label(catConfig.labels) : cat;
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="text-foreground">{catLabel}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(amount, defaultCurrency)}
                          <span className="ml-1 text-[10px]">({(ratio * 100).toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="gap-2"
        >
          {t("annualReport.print")}
        </Button>
      </div>
    </>
  );
}
