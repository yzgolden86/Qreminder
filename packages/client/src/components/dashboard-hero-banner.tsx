import { useMemo } from "react";
import { ArrowUpRight, Flame, Globe, Plus, Search, Sparkles, TrendingUp } from "lucide-react";
import type { Subscription } from "@/types/subscription";
import { extractWebsiteDomain } from "@/lib/subscription-form";
import { useI18n } from "@/i18n/I18nProvider";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { AuthorizedImage } from "@/components/authorized-image";
import { colorWithAlpha } from "@/lib/color";

interface DashboardHeroBannerProps {
  subscriptions: Subscription[];
  totalMonthly: number;
  defaultCurrency: string;
  onOpenSearch?: () => void;
  onOpenNew?: () => void;
}

const DEFAULT_COLOR = "hsl(var(--primary))";

export function DashboardHeroBanner({
  subscriptions,
  totalMonthly,
  defaultCurrency,
  onOpenSearch,
  onOpenNew,
}: DashboardHeroBannerProps) {
  const { t, formatCurrency } = useI18n();
  const { config } = useCustomConfig();

  const yearlyProjection = totalMonthly * 12;
  const dailyBurn = totalMonthly / 30;

  const portalItems = useMemo(() => {
    return subscriptions
      .filter((sub) => sub.status !== "cancelled")
      .map((sub) => {
        const websiteMeta = extractWebsiteDomain(sub.website);
        return websiteMeta ? { sub, websiteMeta } : null;
      })
      .filter((item): item is { sub: Subscription; websiteMeta: { href: string; domain: string } } => item !== null);
  }, [subscriptions]);

  return (
    <section className="hero-canvas surface-card relative mb-5 overflow-hidden rounded-2xl p-5 sm:mb-7 sm:p-7">
      {/* Architectural background grid + radial aurora */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grid-bg opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-semibold tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t("dashboard.heroEyebrow")}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-[32px] lg:leading-[1.15]">
            {t("dashboard.heroTitle")}
          </h1>
        </div>

        {/* Quick Telemetry & Command Pills */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/60 px-4 py-2.5 backdrop-blur-md">
            <Flame className="h-4.5 w-4.5 text-primary" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("dashboard.dailyBurn")}
              </p>
              <p className="num-display text-base font-bold text-foreground">
                {formatCurrency(dailyBurn, defaultCurrency)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/60 px-4 py-2.5 backdrop-blur-md">
            <TrendingUp className="h-4.5 w-4.5 text-primary" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("dashboard.annualProjection")}
              </p>
              <p className="num-display text-base font-bold text-foreground">
                {formatCurrency(yearlyProjection, defaultCurrency)}
              </p>
            </div>
          </div>

          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="hidden items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground backdrop-blur-md transition-colors hover:border-primary/40 hover:text-foreground sm:inline-flex"
            >
              <Search className="h-4 w-4" />
              <span>{t("dashboard.shortcutSearch")}</span>
              <kbd className="kbd-chip">/</kbd>
            </button>
          )}

          {onOpenNew && (
            <button
              type="button"
              onClick={onOpenNew}
              className="hidden items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-[13px] font-semibold text-primary backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground sm:inline-flex"
            >
              <Plus className="h-4 w-4" />
              <span>{t("dashboard.shortcutNew")}</span>
              <kbd className="kbd-chip border-primary/30 bg-primary/15 text-current">N</kbd>
            </button>
          )}
        </div>
      </div>

      {/* Quick Renewal Portals Strip — Direct 1-Click Launchpad to Subscription Websites */}
      {portalItems.length > 0 && (
        <div className="relative z-10 mt-5 border-t border-border/60 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-foreground/90">
              <Globe className="h-4 w-4 text-primary" />
              <span>{t("dashboard.quickPortalsTitle")}</span>
            </div>
            <span className="num-display text-xs font-medium text-muted-foreground">
              {portalItems.length} {t("dashboard.linkedPortals")}
            </span>
          </div>

          <div className="-mx-1 flex items-center gap-2.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {portalItems.map(({ sub, websiteMeta }) => {
              const categoryConfig = config.categories.find((c) => c.value === sub.category);
              const accentColor = categoryConfig?.color ?? DEFAULT_COLOR;
              return (
                <a
                  key={sub.id}
                  href={websiteMeta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${sub.name} (${websiteMeta.domain})`}
                  className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-border/80 bg-background/75 py-1.5 pl-2.5 pr-3.5 text-[13px] font-medium text-foreground backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.08] hover:text-primary"
                >
                  <span
                    className="flex h-5.5 w-5.5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold ring-1 ring-border/50"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${colorWithAlpha(accentColor, 0.25)}, ${colorWithAlpha(accentColor, 0.06)})`,
                      color: accentColor,
                    }}
                  >
                    {sub.logo ? (
                      <AuthorizedImage
                        src={sub.logo}
                        alt={sub.name}
                        className="h-full w-full object-contain p-0.5"
                      />
                    ) : (
                      sub.name.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="max-w-[130px] truncate font-semibold">{sub.name}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {websiteMeta.domain}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
