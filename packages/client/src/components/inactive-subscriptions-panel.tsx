/**
 * 闲置订阅识别面板。
 *
 * 在 dashboard 列出"近 60 天没标记使用过"的 active/trial 订阅，按月度等效
 * 金额从高到低排序，让用户先看到最浪费的部分。如果用户从未打卡过任何订阅，
 * 显示一个引导提示而不是空白卡片。
 *
 * 数据来源：
 * - subscription.lastUsedAt（用户主动通过 card dropdown 的"标记为今日使用"打卡）
 * - 60 天阈值是直觉值；后续可让用户在 settings 里自定义
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Trash2, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useI18n } from "@/i18n/I18nProvider";
import { toMonthlyAmount } from "@/lib/subscription-billing";

const INACTIVE_THRESHOLD_DAYS = 60;
const MAX_DISPLAYED = 5;

function daysSince(dateStr: string, today: Date): number {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7)) - 1;
  const d = Number(dateStr.slice(8, 10));
  const past = Date.UTC(y, m, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((now - past) / 86_400_000);
}

export function InactiveSubscriptionsPanel() {
  const { t, formatCurrency } = useI18n();
  const { data: settings } = useSettings();
  const { data: subs } = useSubscriptions();
  const { convert } = useExchangeRates();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";

  const { inactive, untracked, totalWastedMonthly } = useMemo(() => {
    if (!subs) return { inactive: [], untracked: 0, totalWastedMonthly: 0 };
    const today = new Date();
    const active = subs.filter((s) => s.status === "active" || s.status === "trial");
    const untrackedCount = active.filter((s) => !s.lastUsedAt).length;
    const inactiveSubs = active
      .filter((s) => s.lastUsedAt && daysSince(s.lastUsedAt, today) >= INACTIVE_THRESHOLD_DAYS)
      .map((s) => ({
        sub: s,
        daysAgo: daysSince(s.lastUsedAt!, today),
        monthlyInDefault: toMonthlyAmount(
          convert(s.price, s.currency, defaultCurrency),
          s.billingCycle,
          s.customDays,
        ),
      }))
      .sort((a, b) => b.monthlyInDefault - a.monthlyInDefault);

    const wasted = inactiveSubs.reduce((sum, x) => sum + x.monthlyInDefault, 0);
    return {
      inactive: inactiveSubs,
      untracked: untrackedCount,
      totalWastedMonthly: wasted,
    };
  }, [subs, convert, defaultCurrency]);

  if (!subs) return null;
  // No useful signal yet — nudge user to start tracking before showing an
  // empty/misleading panel.
  if (inactive.length === 0 && untracked > 0) {
    return (
      <div className="mb-4 sm:mb-6 surface-card rounded-xl p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            {t("inactive.title")}
          </h3>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {t("inactive.gettingStartedHint", { count: untracked, days: INACTIVE_THRESHOLD_DAYS })}
        </p>
      </div>
    );
  }
  if (inactive.length === 0) return null;

  return (
    <div className="mb-4 sm:mb-6 surface-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">
            {t("inactive.title")}
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {t("inactive.couldSave", { amount: formatCurrency(totalWastedMonthly, defaultCurrency) })}
        </span>
      </div>

      <div className="space-y-2">
        {inactive.slice(0, MAX_DISPLAYED).map(({ sub, daysAgo, monthlyInDefault }) => (
          <Link
            key={sub.id}
            to={`/subscriptions?highlight=${encodeURIComponent(sub.id)}`}
            className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/20 p-2.5 hover:bg-secondary/40"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">
                {sub.name}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("inactive.notUsedFor", { days: daysAgo })}
              </div>
            </div>
            <div className="ml-3 flex flex-col items-end">
              <span className="text-[12px] font-semibold text-warning">
                {formatCurrency(monthlyInDefault, defaultCurrency)}
                <span className="text-[10px] text-muted-foreground"> /mo</span>
              </span>
              <ArrowRight className="mt-1 h-3 w-3 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>

      {(inactive.length > MAX_DISPLAYED || untracked > 0) && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {inactive.length > MAX_DISPLAYED &&
            t("inactive.moreHidden", { count: inactive.length - MAX_DISPLAYED })}
          {inactive.length > MAX_DISPLAYED && untracked > 0 && " · "}
          {untracked > 0 && t("inactive.untrackedHint", { count: untracked })}
        </p>
      )}
    </div>
  );
}
