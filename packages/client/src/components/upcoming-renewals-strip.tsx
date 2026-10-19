import { useMemo } from "react";
import type { Subscription } from "@/types/subscription";
import {
  daysBetweenDateOnly,
  formatDateOnlyMonthDay,
  todayDateOnlyInTimeZone,
} from "@/lib/time/date-only";
import { extractWebsiteDomain } from "@/lib/subscription-form";
import { useI18n } from "@/i18n/I18nProvider";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { AuthorizedImage } from "@/components/authorized-image";
import { colorWithAlpha } from "@/lib/color";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Calendar, Clock } from "lucide-react";

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
      <div className="surface-card rounded-xl p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 ring-1 ring-success/20">
            <Clock className="h-5 w-5 text-success" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {t("dashboard.upcomingRenewals")}
            </h3>
            <p className="text-xs text-muted-foreground">{t("upcoming.noneNextTwoWeeks")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground sm:text-base">
            {t("dashboard.upcomingRenewals")}
          </h3>
        </div>
        <span className="rounded-full border border-border/70 bg-secondary/60 px-3 py-0.5 text-xs font-medium text-muted-foreground">
          {t("subscriptions.count", { count: items.length })}
        </span>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {items.map((sub) => {
          const categoryConfig = config.categories.find((c) => c.value === sub.category);
          const accentColor = categoryConfig?.color ?? DEFAULT_COLOR;
          const isUrgent = sub.daysUntil <= 3;
          const websiteMeta = extractWebsiteDomain(sub.website);
          return (
            <div
              key={sub.id}
              className={cn(
                "group relative flex w-[268px] shrink-0 items-center gap-3 rounded-xl border border-border/80 bg-secondary/35 p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-secondary/70",
                isUrgent && "border-warning/40 bg-warning/5",
              )}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold ring-1 ring-border/50"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${colorWithAlpha(accentColor, 0.22)}, ${colorWithAlpha(accentColor, 0.05)})`,
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
                <div className="flex items-center justify-between gap-1.5">
                  <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">{sub.name}</p>
                  {websiteMeta && (
                    <a
                      href={websiteMeta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${t("subscription.card.visitWebsite")}: ${websiteMeta.domain}`}
                      aria-label={`${t("subscription.card.visitWebsite")} ${sub.name}`}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDateOnlyMonthDay(sub.nextBillingDate, locale)}</span>
                </div>
                <p className={cn("mt-0.5 num-display text-[13px] font-semibold", isUrgent ? "text-warning" : "text-foreground")}>
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
