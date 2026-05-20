import { useMemo } from "react";
import type { Subscription } from "@/types/subscription";
import {
  daysBetweenDateOnly,
  formatDateOnlyMonthDay,
  todayDateOnlyInTimeZone,
} from "@/lib/time/date-only";
import { useI18n } from "@/i18n/I18nProvider";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { AuthorizedImage } from "@/components/authorized-image";
import { colorWithAlpha } from "@/lib/color";
import { cn } from "@/lib/utils";
import { Calendar, Clock } from "lucide-react";

interface UpcomingRenewalsStripProps {
  subscriptions: Subscription[];
  timeZone: string;
}

const DEFAULT_COLOR = "hsl(var(--primary))";

export function UpcomingRenewalsStrip({ subscriptions, timeZone }: UpcomingRenewalsStripProps) {
  const { t, locale, formatCurrency } = useI18n();
  const { config } = useCustomConfig();

  const items = useMemo(() => {
    const today = todayDateOnlyInTimeZone(new Date(), timeZone);
    return subscriptions
      .filter((s) => s.status === "active" || s.status === "trial")
      .map((s) => ({
        ...s,
        daysUntil: daysBetweenDateOnly(today, s.nextBillingDate),
      }))
      .filter((s) => s.daysUntil >= 0 && s.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [subscriptions, timeZone]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
            <Clock className="h-5 w-5 text-success" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t("dashboard.upcomingRenewals")}
            </h3>
            <p className="text-xs text-muted-foreground">{t("upcoming.noneNextTwoWeeks")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {t("dashboard.upcomingRenewals")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t("subscriptions.count", { count: items.length })}
        </span>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.map((sub) => {
          const categoryConfig = config.categories.find((c) => c.value === sub.category);
          const accentColor = categoryConfig?.color ?? DEFAULT_COLOR;
          const isUrgent = sub.daysUntil <= 3;
          return (
            <div
              key={sub.id}
              className={cn(
                "flex w-[240px] shrink-0 items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3 transition-colors hover:bg-secondary",
                isUrgent && "border-warning/40 bg-warning/5",
              )}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${colorWithAlpha(accentColor, 0.2)}, ${colorWithAlpha(accentColor, 0.05)})`,
                  color: accentColor,
                }}
              >
                {sub.logo ? (
                  <AuthorizedImage
                    src={sub.logo}
                    alt={sub.name}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  sub.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{sub.name}</p>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDateOnlyMonthDay(sub.nextBillingDate, locale)}</span>
                </div>
                <p className={cn("mt-0.5 text-xs font-semibold", isUrgent ? "text-warning" : "text-foreground")}>
                  {sub.daysUntil === 0
                    ? t("subscription.card.renewsToday")
                    : t("subscription.card.renewsInDays", { days: sub.daysUntil })}
                  {" · "}
                  {formatCurrency(sub.price, sub.currency)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
