import { useState } from "react";
import { Plus, Trash2, Target, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "@/components/ui/sonner";
import {
  useBudgets,
  useBudgetUsage,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  type Budget,
  type CreateBudgetInput,
} from "@/hooks/use-budgets";
import { useSettings } from "@/hooks/use-settings";
import { useCustomConfig } from "@/contexts/CustomConfigContext";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

type ScopeType = "global" | "category" | "tag" | "payment_method";
type Period = "monthly" | "yearly";

export default function BudgetsPage() {
  const { t, formatCurrency, label } = useI18n();
  const { data: settings } = useSettings();
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";

  const budgetsQuery = useBudgets();
  const usageQuery = useBudgetUsage();
  const budgets = budgetsQuery.data ?? [];
  const usage = usageQuery.data ?? [];
  const usageMap = new Map(usage.map((u) => [u.budgetId, u]));

  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();

  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteBudget.mutateAsync(deleteId);
      toast.success(t("budget.deleteSuccess"));
    } catch {
      toast.error(t("error.generic"));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {t("budget.pageTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("budget.pageSubtitle")}</p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow"
        >
          <Plus className="h-4 w-4" />
          {t("budget.create")}
        </Button>
      </div>

      {budgetsQuery.isPending ? (
        <div className="surface-card rounded-xl p-8 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : budgets.length === 0 ? (
        <div className="surface-card rounded-xl p-12 text-center">
          <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="mb-1 text-sm font-medium text-foreground">{t("budget.emptyTitle")}</p>
          <p className="mb-4 text-[12px] text-muted-foreground">{t("budget.emptyHint")}</p>
          <Button onClick={() => setAddOpen(true)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow">
            <Plus className="h-4 w-4" />
            {t("budget.createFirst")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const usageInfo = usageMap.get(budget.id);
            const usagePercent = usageInfo?.usagePercent ?? 0;
            const spent = usageInfo?.spent ?? 0;
            const overBudget = usageInfo?.overBudget ?? false;
            const scopeLabel = formatScopeLabel(budget, label);
            const periodLabel = budget.period === "monthly" ? t("budget.periodMonthly") : t("budget.periodYearly");

            return (
              <div key={budget.id} className="surface-card lift-on-hover rounded-xl p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate text-[13px] font-medium text-foreground">{scopeLabel}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{periodLabel}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setEditingBudget(budget)}
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(budget.id)}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xl font-bold text-foreground">
                    {formatCurrency(spent, budget.currency)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    / {formatCurrency(budget.amount, budget.currency)}
                  </span>
                </div>

                <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      usagePercent >= 100 ? "bg-destructive" :
                      usagePercent >= 80 ? "bg-warning" : "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, usagePercent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span className={cn(
                    "font-medium",
                    overBudget ? "text-destructive" :
                    usagePercent >= 80 ? "text-warning" : "text-muted-foreground",
                  )}>
                    {usagePercent}% {overBudget ? t("budget.overBudget") : ""}
                  </span>
                  {!budget.enabled && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {t("budget.disabled")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BudgetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultCurrency={defaultCurrency}
        onSubmit={async (data) => {
          try {
            await createBudget.mutateAsync(data);
            toast.success(t("budget.createSuccess"));
            setAddOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("error.generic"));
          }
        }}
      />

      <BudgetDialog
        open={editingBudget !== null}
        onOpenChange={(open) => !open && setEditingBudget(null)}
        defaultCurrency={defaultCurrency}
        initialBudget={editingBudget}
        onSubmit={async (data) => {
          if (!editingBudget) return;
          try {
            await updateBudget.mutateAsync({ id: editingBudget.id, ...data });
            toast.success(t("budget.updateSuccess"));
            setEditingBudget(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("error.generic"));
          }
        }}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("budget.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("budget.deleteConfirm")}</AlertDialogDescription>
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

function formatScopeLabel(
  budget: Budget,
  label: ReturnType<typeof useI18n>["label"],
): string {
  if (budget.scopeType === "global") return "全局 / Global";
  if (budget.scopeId) return `${budget.scopeType}: ${budget.scopeId}`;
  return budget.scopeType;
}

interface BudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency: string;
  initialBudget?: Budget | null;
  onSubmit: (data: CreateBudgetInput) => void | Promise<void>;
}

function BudgetDialog({ open, onOpenChange, defaultCurrency, initialBudget, onSubmit }: BudgetDialogProps) {
  const { t, label } = useI18n();
  const { config } = useCustomConfig();
  const subscriptionsQuery = useSubscriptions();
  const subscriptions = subscriptionsQuery.data ?? [];
  const tags = Array.from(new Set(subscriptions.flatMap((s) => s.tags ?? []))).sort();

  const [scopeType, setScopeType] = useState<ScopeType>(initialBudget?.scopeType ?? "global");
  const [scopeId, setScopeId] = useState<string>(initialBudget?.scopeId ?? "");
  const [period, setPeriod] = useState<Period>(initialBudget?.period ?? "monthly");
  const [amount, setAmount] = useState(initialBudget ? String(initialBudget.amount) : "");
  const [currency, setCurrency] = useState(initialBudget?.currency ?? defaultCurrency);
  const [enabled, setEnabled] = useState(initialBudget?.enabled ?? true);
  const [submitting, setSubmitting] = useState(false);

  // Re-init form when initialBudget changes (edit mode)
  const isEdit = Boolean(initialBudget);

  const handleSubmit = async () => {
    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    if (scopeType !== "global" && !scopeId) return;
    setSubmitting(true);
    try {
      await onSubmit({
        scopeType,
        ...(scopeType !== "global" ? { scopeId } : {}),
        period,
        amount: parsedAmount,
        currency,
        enabled,
      });
      if (!isEdit) {
        setScopeType("global");
        setScopeId("");
        setAmount("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const scopeOptions = scopeType === "category"
    ? config.categories.map((c) => ({ value: c.value, label: label(c.labels) }))
    : scopeType === "tag"
      ? tags.map((tag) => ({ value: tag, label: tag }))
      : scopeType === "payment_method"
        ? config.paymentMethods.map((p) => ({ value: p.value, label: label(p.labels) }))
        : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("budget.editTitle") : t("budget.createTitle")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("budget.editDescription") : t("budget.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t("budget.scope")}</Label>
            <Select value={scopeType} onValueChange={(v) => { setScopeType(v as ScopeType); setScopeId(""); }}>
              <SelectTrigger className="border-border bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">{t("budget.scopeGlobal")}</SelectItem>
                <SelectItem value="category">{t("budget.scopeCategory")}</SelectItem>
                <SelectItem value="tag">{t("budget.scopeTag")}</SelectItem>
                <SelectItem value="payment_method">{t("budget.scopePaymentMethod")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scopeType !== "global" && (
            <div className="grid gap-2">
              <Label>{t("budget.scopeTarget")}</Label>
              <Select value={scopeId} onValueChange={setScopeId}>
                <SelectTrigger className="border-border bg-secondary">
                  <SelectValue placeholder={t("budget.scopeTargetPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
                      {t("budget.scopeTargetEmpty")}
                    </div>
                  ) : (
                    scopeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t("budget.period")}</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="border-border bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("budget.periodMonthly")}</SelectItem>
                  <SelectItem value="yearly">{t("budget.periodYearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget-currency">{t("payments.colCurrency")}</Label>
              <Input
                id="budget-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={10}
                className="border-border bg-secondary"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="budget-amount">{t("budget.amount")}</Label>
            <Input
              id="budget-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="border-border bg-secondary"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 p-3">
            <div>
              <Label htmlFor="budget-enabled" className="text-[12px]">{t("common.enabled")}</Label>
              <p className="text-[10px] text-muted-foreground">{t("budget.enabledHelp")}</p>
            </div>
            <Switch id="budget-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!amount || submitting || (scopeType !== "global" && !scopeId)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
