import { useMemo } from "react";
import type { Subscription } from "@/types/subscription";
import {
  daysBetweenDateOnly,
  todayDateOnlyInTimeZone,
} from "@/lib/time/date-only";
import { useI18n } from "@/i18n/I18nProvider";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettings } from "@/hooks/use-settings";
import { Calendar } from "lucide-react";

interface RenewalTop5ChartProps {
  subscriptions: Subscription[];
  timeZone: string;
}

export function RenewalTop5Chart({ subscriptions, timeZone }: RenewalTop5ChartProps) {
  const { t, formatCurrency } = useI18n();
  const { data: settings } = useSettings();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const { convert } = useExchangeRates(settings?.exchangeRateProvider);

  const items = useMemo(() => {
    const today = todayDateOnlyInTimeZone(new Date(), timeZone);
    return subscriptions
      .filter((s) => s.status === "active" || s.status === "trial")
      .map((s) => {
        const days = daysBetweenDateOnly(today, s.nextBillingDate);
        const amountInDefault = convert(s.price, s.currency, defaultCurrency);
        return { ...s, daysUntil: days, amountInDefault };
      })
      .filter((s) => s.daysUntil >= 0 && s.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5);
  }, [convert, defaultCurrency, subscriptions, timeZone]);

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t("upcoming.noneNextTwoWeeks")}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((sub) => (
        <div
          key={sub.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 transition-colors hover:bg-secondary"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
            {sub.daysUntil === 0
              ? t("upcoming.todayShort")
              : t("upcoming.daysShort", { days: sub.daysUntil })}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{sub.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatCurrency(sub.price, sub.currency)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
