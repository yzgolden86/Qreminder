import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { type Payment } from "@/hooks/use-payments";
import type { Subscription } from "@/types/subscription";

interface AddPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptions: Subscription[] | undefined;
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

export function AddPaymentDialog({
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

interface SyncFromSubsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  isPending: boolean;
  onConfirm: (scope: "month" | "year" | "all") => void | Promise<void>;
}

export function SyncFromSubsDialog({
  open,
  onOpenChange,
  activeCount,
  isPending,
  onConfirm,
}: SyncFromSubsDialogProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<"month" | "year" | "all">("month");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            {t("payments.syncFromSubs")}
          </DialogTitle>
          <DialogDescription>{t("payments.syncDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-[12px] text-muted-foreground">
            {t("payments.syncActiveCount", { count: activeCount })}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sync-scope">{t("payments.syncScope")}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "month" | "year" | "all")}>
              <SelectTrigger id="sync-scope" className="border-border bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">{t("payments.syncScopeMonth")}</SelectItem>
                <SelectItem value="year">{t("payments.syncScopeYear")}</SelectItem>
                <SelectItem value="all">{t("payments.syncScopeAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-[11px] text-warning">
            {t("payments.syncDedupHint")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => onConfirm(scope)}
            disabled={isPending || activeCount === 0}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? t("payments.syncing") : t("payments.syncConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditPaymentDialogProps {
  payment: Payment | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    paidAt?: string;
    amount?: number;
    currency?: string;
    paymentMethod?: string;
    note?: string;
  }) => void | Promise<void>;
}

export function EditPaymentDialog({ payment, onOpenChange, onSubmit }: EditPaymentDialogProps) {
  const { t } = useI18n();
  const [paidAt, setPaidAt] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setPaidAt(payment.paidAt.slice(0, 10));
    setAmount(String(payment.amount));
    setCurrency(payment.currency);
    setPaymentMethod(payment.paymentMethod ?? "");
    setNote(payment.note ?? "");
  }, [payment]);

  const handleSubmit = async () => {
    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;
    setSubmitting(true);
    try {
      const data: {
        paidAt?: string;
        amount?: number;
        currency?: string;
        paymentMethod?: string;
        note?: string;
      } = {
        paidAt,
        amount: parsedAmount,
        paymentMethod,
        note,
      };
      const trimmedCurrency = currency.trim().toUpperCase();
      if (trimmedCurrency) data.currency = trimmedCurrency;
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={payment !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("payments.editTitle")}</DialogTitle>
          <DialogDescription>{t("payments.editDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-payment-amount">{t("payments.colAmount")}</Label>
              <Input
                id="edit-payment-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="border-border bg-secondary"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-payment-currency">{t("payments.colCurrency")}</Label>
              <Input
                id="edit-payment-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={10}
                className="border-border bg-secondary"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-payment-date">{t("payments.colDate")}</Label>
            <Input
              id="edit-payment-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="border-border bg-secondary"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-payment-method">{t("payments.colMethod")}</Label>
            <Input
              id="edit-payment-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder={t("payments.methodPlaceholder")}
              className="border-border bg-secondary"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-payment-note">{t("payments.colNote")}</Label>
            <Input
              id="edit-payment-note"
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
            disabled={!amount || submitting}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
