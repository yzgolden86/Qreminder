/**
 * 价格历史面板 — 显示在订阅编辑弹窗底部。
 *
 * 列出 PATCH 时触发的价格/货币变更记录（最新在上），展示原价 → 新价、变化幅度，
 * 让用户能看到订阅"涨价了多少"。
 */
import { TrendingUp, TrendingDown } from "lucide-react";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

interface PriceHistoryPanelProps {
  subscriptionId: string;
}

export function PriceHistoryPanel({ subscriptionId }: PriceHistoryPanelProps) {
  const { t, formatCurrency } = useI18n();
  const { data, isLoading } = usePriceHistory(subscriptionId);

  if (isLoading) {
    return (
      <div className="text-[11px] text-muted-foreground">{t("common.loading")}</div>
    );
  }

  const history = data?.history ?? [];
  if (history.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">{t("priceHistory.empty")}</div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {history.map((entry) => {
        // Treat the "more expensive" side as upward only when the currency
        // matches — comparing across currencies without conversion would lie.
        const sameCurrency = entry.oldCurrency === entry.newCurrency;
        const delta = entry.newPrice - entry.oldPrice;
        const percent = entry.oldPrice > 0 ? (delta / entry.oldPrice) * 100 : 0;
        const trend: "up" | "down" | "flat" = sameCurrency
          ? delta > 0
            ? "up"
            : delta < 0
              ? "down"
              : "flat"
          : "flat";
        const date = entry.changedAt.slice(0, 10);
        return (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/20 px-2.5 py-1.5 text-[11px]"
          >
            <span className="text-muted-foreground">{date}</span>
            <span className="flex items-center gap-1.5 text-foreground">
              <span className="line-through text-muted-foreground">
                {formatCurrency(entry.oldPrice, entry.oldCurrency)}
              </span>
              <span>→</span>
              <span className="font-medium">
                {formatCurrency(entry.newPrice, entry.newCurrency)}
              </span>
              {sameCurrency && trend !== "flat" && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-[10px] font-medium",
                    trend === "up" ? "text-destructive" : "text-success",
                  )}
                >
                  {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {`${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
