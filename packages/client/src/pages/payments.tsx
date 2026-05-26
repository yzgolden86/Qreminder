import { useMemo, useState } from "react";
import { Calendar, Plus, Trash2, Pencil, Filter, TrendingUp, CreditCard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { toast } from "@/components/ui/sonner";
import {
  usePayments,
  usePaymentStats,
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  useSyncFromSubscriptions,
  type Payment,
} from "@/hooks/use-payments";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { AddPaymentDialog, SyncFromSubsDialog, EditPaymentDialog } from "./payment-dialogs";
import { useI18n } from "@/i18n/I18nProvider";

export default function PaymentsPage() {
  const { t, formatCurrency } = useI18n();
  const { data: settings } = useSettings();
  const { convert } = useExchangeRates();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";

  const [filterSubId, setFilterSubId] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const subscriptionsQuery = useSubscriptions();
  const subscriptions = subscriptionsQuery.data ?? [];
  const subMap = useMemo(
    () => new Map(subscriptions.map((s) => [s.id, s])),
    [subscriptions],
  );

  const paymentsQuery = usePayments(filterSubId === "all" ? undefined : filterSubId);
  const payments = paymentsQuery.data ?? [];

  const statsQuery = usePaymentStats();
  const stats = statsQuery.data;

  // Convert per-currency totals to user's default currency. The raw
  // monthlySpent/yearlySpent fields from /stats sum across currencies
  // without conversion and are only correct for single-currency users.
  const { actualMonth, actualYear } = useMemo(() => {
    const monthly = stats?.monthlyByCurrency ?? {};
    const yearly = stats?.yearlyByCurrency ?? {};
    const sumConverted = (buckets: Record<string, number>) =>
      Object.entries(buckets).reduce(
        (sum, [cur, amount]) => sum + convert(amount, cur, defaultCurrency),
        0,
      );
    return {
      actualMonth: sumConverted(monthly),
      actualYear: sumConverted(yearly),
    };
  }, [stats?.monthlyByCurrency, stats?.yearlyByCurrency, convert, defaultCurrency]);

  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();
  const syncFromSubs = useSyncFromSubscriptions();

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deletePayment.mutateAsync(deleteId);
      toast.success(t("payments.deleteSuccess"));
    } catch {
      toast.error(t("error.generic"));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          {t("payments.title")}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("payments.subtitle")}</p>
      </div>

      <div className="mb-6 grid gap-3 sm:gap-5 sm:grid-cols-4">
        <StatCard
          title={t("payments.monthSpent")}
          value={formatCurrency(actualMonth, defaultCurrency)}
          subtitle={
            stats && Object.keys(stats.monthlyByCurrency).length > 1
              ? t("payments.convertedHint")
              : t("payments.realActual")
          }
          icon={<CreditCard className="h-6 w-6" />}
          variant="primary"
        />
        <StatCard
          title={t("payments.monthCount")}
          value={stats?.monthlyCount ?? 0}
          subtitle={t("payments.thisMonthPayments")}
          icon={<Calendar className="h-6 w-6" />}
        />
        <StatCard
          title={t("payments.yearSpent")}
          value={formatCurrency(actualYear, defaultCurrency)}
          subtitle={t("payments.realActual")}
          icon={<TrendingUp className="h-6 w-6" />}
        />
        <StatCard
          title={t("payments.totalCount")}
          value={stats?.totalPayments ?? 0}
          subtitle={t("payments.recordCount")}
          icon={<Calendar className="h-6 w-6" />}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterSubId} onValueChange={setFilterSubId}>
            <SelectTrigger className="w-full border-border bg-secondary sm:w-[280px]">
              <SelectValue placeholder={t("payments.filterAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("payments.filterAll")}</SelectItem>
              {subscriptions.map((sub) => (
                <SelectItem key={sub.id} value={sub.id}>
                  {sub.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            onClick={() => setSyncOpen(true)}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t("payments.syncFromSubs")}
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            <Plus className="h-4 w-4" />
            {t("payments.addPayment")}
          </Button>
        </div>
      </div>

      {paymentsQuery.isPending ? (
        <div className="surface-card rounded-xl p-8 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : payments.length === 0 ? (
        <div className="surface-card rounded-xl p-12 text-center">
          <p className="mb-2 text-sm font-medium text-foreground">{t("payments.empty")}</p>
          <p className="text-[12px] text-muted-foreground">{t("payments.emptyHint")}</p>
        </div>
      ) : (
        <div className="surface-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-[12px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t("payments.colSubscription")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("payments.colAmount")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("payments.colMethod")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("payments.colDate")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("payments.colNote")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment) => {
                  const sub = payment.subscriptionId ? subMap.get(payment.subscriptionId) : undefined;
                  // Render priority: live subscription name → cached name on the
                  // payment row (set at insert time so orphaned rows stay readable
                  // after their subscription is deleted) → em-dash placeholder.
                  const displayName = sub?.name || payment.subscriptionName || "";
                  return (
                    <tr key={payment.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {displayName ? (
                          <span className={sub ? "" : "text-muted-foreground italic"}>
                            {displayName}
                            {!sub && displayName && (
                              <span className="ml-1 text-[10px] text-muted-foreground">({t("payments.subscriptionDeleted")})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {formatCurrency(payment.amount, payment.currency)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {payment.paymentMethod || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{payment.paidAt}</td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground max-w-[200px] truncate">
                        {payment.note || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditingPayment(payment)}
                            aria-label={t("common.edit")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteId(payment.id)}
                            aria-label={t("common.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddPaymentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        subscriptions={subscriptions}
        onSubmit={async (data) => {
          try {
            await createPayment.mutateAsync(data);
            toast.success(t("payments.createSuccess"));
            setAddOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("error.generic"));
          }
        }}
        defaultCurrency={defaultCurrency}
      />

      <SyncFromSubsDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        activeCount={subscriptions.filter((s) => s.status === "active" || s.status === "trial").length}
        isPending={syncFromSubs.isPending}
        onConfirm={async (scope) => {
          try {
            const res = await syncFromSubs.mutateAsync({ scope });
            toast.success(
              t("payments.syncResult", { inserted: res.inserted, skipped: res.skipped }),
            );
            setSyncOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("error.generic"));
          }
        }}
      />

      <EditPaymentDialog
        payment={editingPayment}
        onOpenChange={(open) => { if (!open) setEditingPayment(null); }}
        onSubmit={async (data) => {
          if (!editingPayment) return;
          try {
            await updatePayment.mutateAsync({ id: editingPayment.id, data });
            toast.success(t("payments.updateSuccess"));
            setEditingPayment(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("error.generic"));
          }
        }}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("payments.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("payments.deleteConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
