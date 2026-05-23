/**
 * 订阅卡片组件。
 *
 * 用途：
 * - 在仪表盘与订阅列表展示订阅概览
 * - 提供编辑/删除入口
 * - 根据续费/试用到期情况做提示（颜色/动画）
 *
 * Caveat: 卡片直接读取自定义配置来显示分类颜色。若未来支持服务端渲染卡片，
 * 需要把 label/color view model 从上层传入。
 */

import { useEffect, useState } from 'react';
import { Subscription, STATUS_LABELS, CYCLE_LABELS } from '@/types/subscription';
import { useCustomConfig } from '@/contexts/CustomConfigContext';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { colorWithAlpha } from '@/lib/color';
import { Calendar, MoreHorizontal, CalendarClock, Bell, CreditCard } from 'lucide-react';
import {
  daysBetweenDateOnly,
  todayDateOnlyInTimeZone,
} from '@/lib/time/date-only';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TruncatedTooltipText } from '@/components/ui/truncated-tooltip-text';
import { AuthorizedImage } from '@/components/authorized-image';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useI18n } from '@/i18n/I18nProvider';
import { localizedLabel } from '@/i18n/locales';

interface SubscriptionCardProps {
  /** 订阅数据（前端 domain 类型）。 */
  subscription: Subscription;
  /** 展示模式：grid（卡片）/ list（列表行）。 */
  viewMode?: 'grid' | 'list';
  /** 点击”编辑”回调（传订阅 id）。 */
  onEdit?: (id: string) => void;
  /** 点击”删除确认”回调（传订阅 id）。 */
  onDelete?: (id: string) => void;
  /** 点击”快速续费”回调（传订阅 id）。 */
  onRenew?: (id: string) => void;
  /** 用户 IANA 时区，用于续费/试用提示窗口。 */
  timeZone: string;
}

/** 状态配色：用于 trial/active 等视觉提示。 */
const statusStyles: Record<string, string> = {
  trial: 'bg-warning/10 text-warning border-warning/20',
  active: 'bg-success/10 text-success border-success/20',
  paused: 'bg-muted text-muted-foreground border-muted',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
};

const DEFAULT_BADGE_COLOR = "hsl(var(--primary))";

/** 订阅卡片。 */
export function SubscriptionCard({ subscription, viewMode = 'grid', onEdit, onDelete, onRenew, timeZone }: SubscriptionCardProps) {
  const { config } = useCustomConfig();
  const { t, locale, label, formatCurrency, formatDateOnly } = useI18n();
  const categoryConfig = config.categories.find((c) => c.value === subscription.category);
  const categoryLabel = categoryConfig ? label(categoryConfig.labels) : subscription.category;
  const categoryColor = categoryConfig?.color ?? DEFAULT_BADGE_COLOR;
  const categoryBadgeStyle = {
    backgroundColor: colorWithAlpha(categoryColor, 0.1) ?? undefined,
    borderColor: colorWithAlpha(categoryColor, 0.2) ?? undefined,
    color: categoryColor,
  };

  const logoBackgroundFrom = colorWithAlpha(categoryColor, 0.2) ?? categoryColor;
  const logoBackgroundTo = colorWithAlpha(categoryColor, 0.05) ?? categoryColor;
  const logoBackgroundStyle = {
    backgroundImage: `linear-gradient(135deg, ${logoBackgroundFrom}, ${logoBackgroundTo})`,
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const today = todayDateOnlyInTimeZone(new Date(), timeZone);
  const daysUntilRenewal = daysBetweenDateOnly(today, subscription.nextBillingDate);
  const daysUntilTrialEnd = subscription.trialEndDate ? daysBetweenDateOnly(today, subscription.trialEndDate) : null;
  // 这里是展示提示窗口，不等同于 Cron 通知窗口；不要把两者的阈值混用。
  const isRenewingSoon = daysUntilRenewal <= 7 && daysUntilRenewal >= 0;
  const isTrialEndingSoon = subscription.status === 'trial' && daysUntilTrialEnd !== null &&
    daysUntilTrialEnd <= 3 && daysUntilTrialEnd >= 0;

  // 当 logo 变化时重置错误状态（例如用户从无效 URL 换成了有效 URL）
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [subscription.logo]);

  /** 删除确认：触发回调并关闭弹窗。 */
  const handleDeleteConfirm = () => {
    onDelete?.(subscription.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
    <div className={cn(
      "surface-card lift-on-hover group relative h-full overflow-hidden rounded-lg",
      isRenewingSoon && "border-warning/40",
      isTrialEndingSoon && "animate-pulse-glow"
    )}>
      {/* Linear-style: thin category-tinted left rail */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] opacity-70"
        style={{ background: categoryColor }}
      />

      <div className="flex items-center gap-2.5 p-3 pb-2 pl-4 sm:gap-3 sm:p-4 sm:pb-2.5 sm:pl-5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md text-base font-semibold ring-1 ring-border/60 transition-transform duration-200 group-hover:scale-[1.04] sm:h-11 sm:w-11"
          style={logoBackgroundStyle}
        >
          {subscription.logo && !logoLoadFailed ? (
            <AuthorizedImage
              src={subscription.logo}
              alt={subscription.name}
              className="h-full w-full object-contain p-1.5"
              onError={() => setLogoLoadFailed(true)}
            />
          ) : (
            <span style={{ color: categoryColor }}>{subscription.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <TruncatedTooltipText
            as="h3"
            text={subscription.name}
            className="min-w-0 text-[13px] font-semibold tracking-tight text-foreground sm:text-[14px]"
          />
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground sm:text-[11px]">
            {localizedLabel(CYCLE_LABELS[subscription.billingCycle], locale)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="num-display whitespace-nowrap text-[17px] font-semibold leading-none text-foreground sm:text-[20px]">
            {formatCurrency(subscription.price, subscription.currency)}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={t("subscription.moreActions")}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit?.(subscription.id)}>
              {t("common.edit")}
            </DropdownMenuItem>
            {onRenew && (
              <DropdownMenuItem onClick={() => onRenew(subscription.id)}>
                {t("payments.quickRenew")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive"
            >
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 sm:px-5 sm:pb-3">
        <Badge
          variant="outline"
          className="max-w-full shrink-0 overflow-hidden whitespace-nowrap text-xs"
          style={categoryBadgeStyle}
        >
          <TruncatedTooltipText text={categoryLabel} className="block max-w-full" />
        </Badge>
        <Badge
          variant="outline"
          className={cn("shrink-0 whitespace-nowrap text-xs", statusStyles[subscription.status])}
        >
          {localizedLabel(STATUS_LABELS[subscription.status], locale)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 px-4 py-2.5 text-[11px] text-muted-foreground sm:gap-x-4 sm:px-5 sm:py-3 sm:text-xs">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>{t("subscription.card.startPrefix")} {formatDateOnly(subscription.startDate)}</span>
        </div>

        <div className={cn(
          "flex items-center gap-1.5",
          isRenewingSoon && "text-warning"
        )}>
          <Calendar className="h-3.5 w-3.5" />
          <span>
            {isRenewingSoon ? (
              daysUntilRenewal === 0 ? t("subscription.card.renewsToday") : t("subscription.card.renewsInDays", { days: daysUntilRenewal })
            ) : (
              t("subscription.card.duePrefix", { date: formatDateOnly(subscription.nextBillingDate) })
            )}
          </span>
        </div>

        {subscription.paymentMethod && (() => {
          const paymentConfig = config.paymentMethods.find(
            m => m.value === subscription.paymentMethod
          );
          return (
            <div className="flex items-center gap-1.5">
              {paymentConfig?.icon ? (
                <AuthorizedImage src={paymentConfig.icon} alt="" className="h-3.5 w-3.5 object-contain" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              <span>{paymentConfig ? label(paymentConfig.labels) : subscription.paymentMethod}</span>
            </div>
          );
        })()}

        {viewMode === 'list' && (
          <div className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            <span>
              {subscription.reminderOffsets.length === 0
                ? t("subscription.card.reminderEmpty")
                : t("subscription.card.reminderOffsets", { offsets: subscription.reminderOffsets.join("/") })}
            </span>
          </div>
        )}
      </div>

      {isTrialEndingSoon && subscription.trialEndDate && (
        <div className="flex items-center gap-2 border-t border-warning/20 bg-warning/5 px-4 py-2.5 text-[11px] font-medium text-warning sm:px-5 sm:text-xs">
          {t("subscription.card.trialEnds", { date: formatDateOnly(subscription.trialEndDate, "monthDay") })}
        </div>
      )}
    </div>

    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("subscription.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("subscription.deleteDescription", { name: subscription.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
