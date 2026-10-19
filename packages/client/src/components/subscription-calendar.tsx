/**
 * subscription-calendar.tsx 是续费日历的月视图入口。
 *
 * 架构位置：这里持有当前月份、选中订阅和单日列表状态，负责把订阅
 * DateOnly 分组为日历网格；详情弹窗拆到 subscription-calendar-dialogs.tsx。
 *
 * Caveat: nextBillingDate 已经是 DateOnly，分组时不能重新用 Date 解析，
 * 否则浏览器时区会导致续费日期跨日。
 */

import { useState, useMemo } from 'react';
import type { Subscription } from '@/types/subscription';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useSettings } from '@/hooks/use-settings';
import { useCustomConfig } from '@/contexts/CustomConfigContext';
import { colorWithAlpha } from '@/lib/color';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  setMonth,
  setYear
} from 'date-fns';
import { cn } from '@/lib/utils';
import { dateToDateOnly, isSameMonthDateOnly } from '@/lib/time/date-only';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/i18n/I18nProvider';
import { DaySubscriptionsDialog, SubscriptionDetailDialog } from './subscription-calendar-dialogs';
import type { CalendarDaySubscriptions } from './subscription-calendar-dialogs';

interface SubscriptionCalendarProps {
  /** 订阅列表（前端 domain 类型）。 */
  subscriptions: Subscription[];
  /** 点击“编辑”时回调（由上层页面打开编辑弹窗）。 */
  onEditSubscription?: (subscription: Subscription) => void;
}

const WEEKDAY_REFERENCE_DATES = [
  new Date(2024, 0, 1),
  new Date(2024, 0, 2),
  new Date(2024, 0, 3),
  new Date(2024, 0, 4),
  new Date(2024, 0, 5),
  new Date(2024, 0, 6),
  new Date(2024, 0, 7),
] as const;

const DEFAULT_CALENDAR_COLOR = "hsl(var(--primary))";

/** 续费日历组件。 */
export const SubscriptionCalendar = ({ subscriptions, onEditSubscription }: SubscriptionCalendarProps) => {
  const { t, formatDateTime, formatCurrency } = useI18n();
  const { config } = useCustomConfig();
  // 默认货币来自 Settings（持久化到 SQLite），用于日历“预计支出”的换算口径。
  const { data: settings } = useSettings();
  const defaultCurrency = settings?.defaultCurrency ?? 'CNY';
  const { convert, getCurrencySymbol } = useExchangeRates(settings?.exchangeRateProvider);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dayListOpen, setDayListOpen] = useState(false);
  const [selectedDaySubs, setSelectedDaySubs] = useState<CalendarDaySubscriptions | null>(null);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearRangeStart, setYearRangeStart] = useState(() => Math.floor(new Date().getFullYear() / 12) * 12);
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, index) => formatDateTime(new Date(2024, index, 1), { month: "long" })),
    [formatDateTime],
  );
  const weekdayLabels = useMemo(
    () => WEEKDAY_REFERENCE_DATES.map((date) => formatDateTime(date, { weekday: "short" })),
    [formatDateTime],
  );

  // 将订阅按 “YYYY-MM-DD” 分组（同一天可能有多条订阅）。订阅日期已经是 DateOnly，
  // 这里不能再用 Date 解析，否则不同浏览器/服务器时区会让日历跨日。
  const subscriptionsByDate = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    
    subscriptions
      .filter(sub => sub.status === 'active' || sub.status === 'trial')
      .forEach(sub => {
        const dateKey = sub.nextBillingDate;
        const existing = map.get(dateKey) || [];
        map.set(dateKey, [...existing, sub]);
      });
    
    return map;
  }, [subscriptions]);

  const monthlySummary = useMemo(() => {
    let renewalsCount = 0;
    let estimatedSpending = 0;

    for (const [dateKey, daySubs] of subscriptionsByDate.entries()) {
      if (!isSameMonthDateOnly(dateKey, dateToDateOnly(currentMonth))) continue;

      renewalsCount += daySubs.length;
      for (const sub of daySubs) {
        estimatedSpending += convert(sub.price, sub.currency, defaultCurrency);
      }
    }

    return { renewalsCount, estimatedSpending };
  }, [subscriptionsByDate, currentMonth, convert, defaultCurrency]);

  // 生成当前月视图需要展示的日期网格（包含前后补齐的周）
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    // Start from Monday (weekStartsOn: 1)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  const handleSubscriptionClick = (sub: Subscription) => {
    setSelectedSubscription(sub);
    setDetailOpen(true);
  };

  const handleShowDayList = (date: Date, subs: Subscription[]) => {
    setSelectedDaySubs({ date, subscriptions: subs });
    setDayListOpen(true);
  };

  const handleSelectFromList = (sub: Subscription) => {
    setDayListOpen(false);
    setSelectedSubscription(sub);
    setDetailOpen(true);
  };

  return (
    <>
      <div className="surface-card flex flex-1 flex-col rounded-2xl p-4 sm:p-6">
        {/* Header + Inline Monthly KPI Summary */}
        <div className="mb-4 flex flex-col gap-4 border-b border-border/60 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <CalendarDays className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">{t("calendar.title")}</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-secondary/50 px-3.5 py-1.5 text-xs sm:text-sm">
                <span className="text-muted-foreground">{t("calendar.monthlyRenewals")}:</span>
                <span className="num-display font-bold text-foreground">
                  {t("calendar.renewalCount", { count: monthlySummary.renewalsCount })}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.08] px-3.5 py-1.5 text-xs sm:text-sm">
                <span className="text-muted-foreground">{t("calendar.estimatedSpend")}:</span>
                <span className="num-display font-bold text-primary">
                  {formatCurrency(monthlySummary.estimatedSpending, defaultCurrency)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className="h-9 px-3.5 text-xs font-medium sm:text-sm"
            >
              {t("common.today")}
            </Button>
            <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-secondary/40 p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={goToPreviousMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              {/* Year Picker */}
              <Popover open={yearPickerOpen} onOpenChange={setYearPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 px-2.5 text-sm font-semibold hover:bg-secondary sm:text-base"
                  >
                    {formatDateTime(currentMonth, { year: "numeric" })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-3" align="center">
                  <div className="flex items-center justify-between mb-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setYearRangeStart(prev => prev - 12)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary hover:text-primary"
                      onClick={() => {
                        const today = new Date();
                        setCurrentMonth(today);
                        setYearRangeStart(Math.floor(today.getFullYear() / 12) * 12);
                        setYearPickerOpen(false);
                      }}
                    >
                      {t("common.today")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setYearRangeStart(prev => prev + 12)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 12 }, (_, i) => {
                      const year = yearRangeStart + i;
                      const isSelected = year === currentMonth.getFullYear();
                      const isCurrent = year === new Date().getFullYear();
                      return (
                        <button
                          key={year}
                          onClick={() => {
                            setCurrentMonth(setYear(currentMonth, year));
                            setYearPickerOpen(false);
                          }}
                          className={cn(
                            "h-9 rounded-lg text-sm font-medium transition-all",
                            isSelected 
                              ? "bg-primary text-primary-foreground" 
                              : isCurrent
                                ? "bg-accent text-accent-foreground hover:bg-accent/80"
                                : "hover:bg-secondary text-foreground"
                          )}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Month Picker */}
              <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 px-2.5 text-sm font-semibold hover:bg-secondary sm:text-base"
                  >
                    {formatDateTime(currentMonth, { month: "long" })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-3" align="center">
                  <div className="flex items-center justify-center mb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary hover:text-primary"
                      onClick={() => {
                        setCurrentMonth(new Date());
                        setMonthPickerOpen(false);
                      }}
                    >
                      {t("common.today")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {monthLabels.map((month, index) => {
                      const isSelected = index === currentMonth.getMonth();
                      const isCurrent = index === new Date().getMonth() && 
                                       currentMonth.getFullYear() === new Date().getFullYear();
                      return (
                        <button
                          key={month}
                          onClick={() => {
                            setCurrentMonth(setMonth(currentMonth, index));
                            setMonthPickerOpen(false);
                          }}
                          className={cn(
                            "h-9 rounded-lg text-sm font-medium transition-all",
                            isSelected 
                              ? "bg-primary text-primary-foreground" 
                              : isCurrent
                                ? "bg-accent text-accent-foreground hover:bg-accent/80"
                                : "hover:bg-secondary text-foreground"
                          )}
                        >
                          {month}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={goToNextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="mb-1.5 grid grid-cols-7">
          {weekdayLabels.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-[13px]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Full-Page Calendar Grid */}
        <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-xl bg-border/60 ring-1 ring-border/70">
          {calendarDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const daySubs = subscriptionsByDate.get(dateKey) || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isDayToday = isToday(day);
            const hasSubs = daySubs.length > 0;

            return (
              <div
                key={dateKey}
                className={cn(
                  "flex min-h-[96px] flex-col bg-card p-1.5 transition-colors sm:min-h-[126px] sm:p-2.5 lg:min-h-[144px]",
                  !isCurrentMonth && "bg-muted/25",
                  isDayToday && "bg-primary/[0.04] ring-1 ring-inset ring-primary/35",
                  hasSubs && isCurrentMonth && "hover:bg-secondary/25",
                )}
              >
                {/* Day Header */}
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  {hasSubs ? (
                    <span className="hidden rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary sm:inline-block">
                      {daySubs.length}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span
                    className={cn(
                      "num-display flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium sm:h-7 sm:w-7 sm:text-sm",
                      isDayToday && "bg-primary font-bold text-primary-foreground shadow-sm",
                      !isDayToday && isCurrentMonth && "text-foreground",
                      !isDayToday && !isCurrentMonth && "text-muted-foreground/40"
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Subscriptions in Day Cell */}
                <div className="grid gap-1 sm:gap-1.5">
                  <TooltipProvider delayDuration={180}>
                    {daySubs.slice(0, 2).map((sub) => {
                      const categoryConfig = config.categories.find((c) => c.value === sub.category);
                      const accentColor = categoryConfig?.color ?? DEFAULT_CALENDAR_COLOR;
                      return (
                        <Tooltip key={sub.id}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={sub.name}
                              onClick={() => handleSubscriptionClick(sub)}
                              style={{
                                borderLeftColor: accentColor,
                                backgroundColor: colorWithAlpha(accentColor, 0.1) ?? undefined,
                              }}
                              className={cn(
                                "group/pill flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border/60 border-l-[3px] px-1.5 py-1 text-left transition-all hover:brightness-110 sm:px-2 sm:py-1.5",
                                "text-[11px] sm:text-xs text-foreground shadow-2xs"
                              )}
                            >
                              <span className="truncate font-semibold">{sub.name}</span>
                              <span className="num-display hidden shrink-0 text-[10.5px] font-semibold text-muted-foreground group-hover/pill:text-foreground md:inline">
                                {getCurrencySymbol(sub.currency)}{sub.price}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-semibold">{sub.name}</p>
                            <p className="text-muted-foreground">
                              {getCurrencySymbol(sub.currency)}{sub.price}
                            </p>
                            <p className="text-muted-foreground/70">{t("calendar.viewDetails")}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    {daySubs.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleShowDayList(day, daySubs)}
                        className="w-full cursor-pointer rounded-md bg-primary/10 py-0.5 text-center text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 sm:text-xs"
                      >
                        {t("calendar.more", { count: daySubs.length - 2 })}
                      </button>
                    )}
                  </TooltipProvider>
                </div>
              </div>
            );
          })}
        </div>
      </div>


      <SubscriptionDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        subscription={selectedSubscription}
        onEditSubscription={onEditSubscription}
      />

      <DaySubscriptionsDialog
        open={dayListOpen}
        onOpenChange={setDayListOpen}
        selectedDaySubs={selectedDaySubs}
        onSelectSubscription={handleSelectFromList}
      />
    </>
  );
};
