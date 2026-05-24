import { useMemo, useState } from "react";
import { Calendar, Plus, Trash2, Pencil, Filter, TrendingUp, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useDeletePayment,
  type Payment,
} from "@/hooks/use-payments";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useI18n } from "@/i18n/I18nProvider";

export default function PaymentsPage() {
  const { t, formatCurrency } = useI18n();
  const { data: settings } = useSettings();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";

  const [filterSubId, setFilterSubId] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
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

  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();

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
          value={formatCurrency(stats?.monthlySpent ?? 0, defaultCurrency)}
          subtitle={
            stats && Object.keys(stats.monthlyByCurrency).length > 1
              ? t("payments.mixedCurrencyHint")
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
          value={formatCurrency(stats?.yearlySpent ?? 0, defaultCurrency)}
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
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow"
        >
          <Plus className="h-4 w-4" />
          {t("payments.addPayment")}
        </Button>
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
                  const sub = subMap.get(payment.subscriptionId);
                  return (
                    <tr key={payment.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {sub?.name ?? <span className="text-muted-foreground">—</span>}
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

interface AddPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptions: ReturnType<typeof useSubscriptions>["data"] extends infer T ? (T extends undefined ? never : T) : never;
  onSubmit: (data: {
    subscriptionId: string;
    paidAt: string;
    amount: number;
    currency: string;
    paymentMethod?: string;
    note?: string;
  }) => void | Promise<void>;
  defaultCurrency: string;
}

function AddPaymentDialog({
  open,
  onOpenChange,
  subscriptions,
  onSubmit,
  defaultCurrency,
}: AddPaymentDialogProps) {
  const { t } = useI18n();
  const [subId, setSubId] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubscriptionChange = (value: string) => {
    setSubId(value);
    const selected = subscriptions?.find((s) => s.id === value);
    if (selected) {
      setAmount(String(selected.price));
      setCurrency(selected.currency);
      setPaymentMethod(selected.paymentMethod || "");
    }
  };

  const handleSubmit = async () => {
    if (!subId) return;
    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        subscriptionId: subId,
        paidAt,
        amount: parsedAmount,
        currency,
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(note ? { note } : {}),
      });
      setSubId("");
      setAmount("");
      setNote("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("payments.addTitle")}</DialogTitle>
          <DialogDescription>{t("payments.addDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="add-payment-sub">{t("payments.colSubscription")}</Label>
            <Select value={subId} onValueChange={handleSubscriptionChange}>
              <SelectTrigger id="add-payment-sub" className="border-border bg-secondary">
                <SelectValue placeholder={t("payments.selectSubscription")} />
              </SelectTrigger>
              <SelectContent>
                {subscriptions?.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="add-payment-amount">{t("payments.colAmount")}</Label>
              <Input
                id="add-payment-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="border-border bg-secondary"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-payment-currency">{t("payments.colCurrency")}</Label>
              <Input
                id="add-payment-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="CNY"
                maxLength={10}
                className="border-border bg-secondary"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-payment-date">{t("payments.colDate")}</Label>
            <Input
              id="add-payment-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="border-border bg-secondary"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-payment-method">{t("payments.colMethod")}</Label>
            <Input
              id="add-payment-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder={t("payments.methodPlaceholder")}
              className="border-border bg-secondary"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-payment-note">{t("payments.colNote")}</Label>
            <Input
              id="add-payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("payments.notePlaceholder")}
              className="border-border bg-secondary"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!subId || !amount || submitting}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
