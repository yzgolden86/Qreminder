/**
 * 移动端首页快捷卡片组件
 *
 * 为移动端用户提供关键信息的快速访问：
 * - 今日到期
 * - 7天内到期
 * - 本月待付
 * - 本年预计支出
 */
import { useMemo } from "react";
import { Calendar, Clock, CreditCard, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider";
import { daysBetweenDateOnly, todayDateOnlyInTimeZone } from "@/lib/time/date-only";
import { toMonthlyAmount } from "@/lib/subscription-billing";
import type { Subscription } from "@/types/subscription";

interface MobileQuickCardsProps {
  subscriptions: Subscription[];
  defaultCurrency: string;
  convert: (amount: number, from: string, to: string) => number;
  timeZone: string;
  className?: string;
}

interface QuickCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: "default" | "warning" | "success";
  onClick?: () => void;
}

function QuickCard({ icon, label, value, subtitle, variant = "default", onClick }: QuickCardProps) {
  const variantClasses = {
    default: "border-border bg-card",
    warning: "border-amber-500/30 bg-amber-500/5",
    success: "border-emerald-500/30 bg-emerald-500/5",
  };

  const iconClasses = {
    default: "text-primary",
    warning: "text-amber-600",
    success: "text-emerald-600",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border p-3 text-left transition-all",
        variantClasses[variant],
        onClick && "hover:shadow-md active:scale-[0.98]",
        !onClick && "cursor-default",
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md bg-background/50", iconClasses[variant])}>
          {icon}
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-bold text-foreground">{value}</div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </button>
  );
}

export function MobileQuickCards({
  subscriptions,
  defaultCurrency,
  convert,
  timeZone,
  className,
}: MobileQuickCardsProps) {
  const { t, formatCurrency } = useI18n();

  const stats = useMemo(() => {
    const now = new Date();
    const today = todayDateOnlyInTimeZone(now, timeZone);
    const activeSubscriptions = subscriptions.filter(
      (sub) => sub.status === "active" || sub.status === "trial"
    );

    // 今日到期
    const expiresToday = activeSubscriptions.filter((sub) => {
      const days = daysBetweenDateOnly(today, sub.nextBillingDate);
      return days === 0;
    });

    // 7天内到期
    const expiresIn7Days = activeSubscriptions.filter((sub) => {
      const days = daysBetweenDateOnly(today, sub.nextBillingDate);
      return days >= 0 && days <= 7;
    });

    // 本月待付金额（7天内到期的订阅总价）
    const monthlyDue = expiresIn7Days.reduce((sum, sub) => {
      const amountInDefault = convert(sub.price, sub.currency, defaultCurrency);
      return sum + amountInDefault;
    }, 0);

    // 本年预计支出（所有活跃订阅的年度总额）
    const yearlyEstimate = activeSubscriptions.reduce((sum, sub) => {
      const amountInDefault = convert(sub.price, sub.currency, defaultCurrency);
      const monthly = toMonthlyAmount(amountInDefault, sub.billingCycle, sub.customDays);
      return sum + monthly * 12;
    }, 0);

    return {
      expiresToday: expiresToday.length,
      expiresIn7Days: expiresIn7Days.length,
      monthlyDue,
      yearlyEstimate,
    };
  }, [subscriptions, defaultCurrency, convert, timeZone]);

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:hidden", className)}>
      <QuickCard
        icon={<Calendar className="h-4 w-4" />}
        label={t("dashboard.expiresToday")}
        value={stats.expiresToday}
        subtitle={stats.expiresToday > 0 ? t("dashboard.needsAttention") : t("dashboard.allGood")}
        variant={stats.expiresToday > 0 ? "warning" : "default"}
      />
      <QuickCard
        icon={<Clock className="h-4 w-4" />}
        label={t("dashboard.next7Days")}
        value={stats.expiresIn7Days}
        subtitle={t("dashboard.upcomingRenewals")}
        variant={stats.expiresIn7Days > 0 ? "warning" : "default"}
      />
      <QuickCard
        icon={<CreditCard className="h-4 w-4" />}
        label={t("dashboard.monthlyDue")}
        value={formatCurrency(stats.monthlyDue, defaultCurrency)}
        subtitle={t("dashboard.next7DaysTotal")}
      />
      <QuickCard
        icon={<TrendingUp className="h-4 w-4" />}
        label={t("dashboard.yearlyEstimate")}
        value={formatCurrency(stats.yearlyEstimate, defaultCurrency)}
        subtitle={t("dashboard.annualProjection")}
      />
    </div>
  );
}
