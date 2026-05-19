import { useMemo } from "react";
import type { Subscription } from "@/types/subscription";
import { toMonthlyAmount } from "@/lib/subscription-billing";
import { useI18n } from "@/i18n/I18nProvider";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettings } from "@/hooks/use-settings";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { colorWithAlpha } from "@/lib/color";

interface MonthlyTop5ChartProps {
  subscriptions: Subscription[];
}

const DEFAULT_COLOR = "hsl(var(--primary))";

export function MonthlyTop5Chart({ subscriptions }: MonthlyTop5ChartProps) {
  const { t, formatCurrency } = useI18n();
  const { data: settings } = useSettings();
  const { config } = useCustomConfig();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const { convert } = useExchangeRates(settings?.exchangeRateProvider);

  const items = useMemo(() => {
    const ranked = subscriptions
      .filter((s) => s.status === "active" || s.status === "trial")
      .map((s) => {
        const amountInDefault = convert(s.price, s.currency, defaultCurrency);
        const monthly = toMonthlyAmount(amountInDefault, s.billingCycle, s.customDays);
        const categoryConfig = config.categories.find((c) => c.value === s.category);
        return {
          id: s.id,
          name: s.name,
          monthly,
          color: categoryConfig?.color ?? DEFAULT_COLOR,
        };
      })
      .filter((s) => s.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, 5);
    const max = ranked[0]?.monthly ?? 0;
    return ranked.map((item) => ({
      ...item,
      pct: max > 0 ? (item.monthly / max) * 100 : 0,
    }));
  }, [config.categories, convert, defaultCurrency, subscriptions]);

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t("statistics.noSubscriptionData")}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item.id} className="grid gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate font-medium text-foreground">{item.name}</span>
            <span className="shrink-0 font-semibold text-foreground">
              {formatCurrency(item.monthly, defaultCurrency)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${item.pct}%`,
                backgroundColor: colorWithAlpha(item.color, 0.8) ?? item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
