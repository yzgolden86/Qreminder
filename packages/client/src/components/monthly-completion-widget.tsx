/**
 * 月度账单完成度小部件。
 *
 * 显示"本月 X 笔应付，已付 Y 笔，逾期 Z 笔"，让用户一眼看出对账完成度。
 * 应付 = active/trial 订阅中 nextBillingDate 落在本月的（粗口径，跨月年付不算）。
 * 已付 = 本月有 subscription_payments 的订阅数（按 subscriptionId 去重）。
 * 逾期 = nextBillingDate 已经过去（< today）但还没有对应当月 payment 的订阅。
 *
 * 不精确处理：semi-annual / quarterly / annual 订阅如果本月不是续费月则不计入"应付"。
 * 这与 stats endpoint 的 monthlySpent 口径一致。
 */
import { useMemo } from "react";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { usePayments } from "@/hooks/use-payments";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export function MonthlyCompletionWidget() {
  const { t } = useI18n();
  const subsQuery = useSubscriptions();
  const paymentsQuery = usePayments();
  const subs = subsQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];

  const { dueCount, paidCount, overdueCount, completion } = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const currentMonth = `${yyyy}-${mm}`;
    const today = `${yyyy}-${mm}-${dd}`;

    const activeSubs = subs.filter(
      (s) => s.status === "active" || s.status === "trial",
    );

    const paidSubIds = new Set(
      payments
        .filter((p) => p.paidAt.slice(0, 10).startsWith(currentMonth) && p.subscriptionId)
        .map((p) => p.subscriptionId!),
    );

    // Due this month: nextBillingDate is in current month, OR already paid this month
    // (payment pushes nextBillingDate forward, so we include paid subs to avoid paid=0)
    const dueSubs = activeSubs.filter(
      (s) => s.nextBillingDate.startsWith(currentMonth) || paidSubIds.has(s.id),
    );

    const paid = dueSubs.filter((s) => paidSubIds.has(s.id)).length;
    const overdue = dueSubs.filter(
      (s) => s.nextBillingDate < today && !paidSubIds.has(s.id),
    ).length;
    const due = dueSubs.length;
    const completionPct = due === 0 ? 100 : Math.round((paid / due) * 100);

    return {
      dueCount: due,
      paidCount: paid,
      overdueCount: overdue,
      completion: completionPct,
    };
  }, [subs, payments]);

  if (subsQuery.isLoading || paymentsQuery.isLoading) return null;
  if (dueCount === 0) return null;

  return (
    <div className="mb-4 sm:mb-6 surface-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2
            className={cn(
              "h-4 w-4",
              completion === 100 ? "text-success" : "text-primary",
            )}
          />
          <h3 className="text-sm font-semibold text-foreground">
            {t("monthlyCompletion.title")}
          </h3>
        </div>
        <span className="text-[12px] font-medium text-foreground">
          {completion}%
        </span>
      </div>

      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            completion === 100 ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${completion}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <div className="flex items-center gap-1.5 rounded-md bg-secondary/30 px-2 py-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <div className="text-[10px] text-muted-foreground">
              {t("monthlyCompletion.due")}
            </div>
            <div className="font-semibold text-foreground">{dueCount}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <div>
            <div className="text-[10px] text-muted-foreground">
              {t("monthlyCompletion.paid")}
            </div>
            <div className="font-semibold text-foreground">{paidCount}</div>
          </div>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5",
            overdueCount > 0 ? "bg-destructive/10" : "bg-secondary/30",
          )}
        >
          <AlertCircle
            className={cn(
              "h-3.5 w-3.5",
              overdueCount > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          />
          <div>
            <div className="text-[10px] text-muted-foreground">
              {t("monthlyCompletion.overdue")}
            </div>
            <div
              className={cn(
                "font-semibold",
                overdueCount > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {overdueCount}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
