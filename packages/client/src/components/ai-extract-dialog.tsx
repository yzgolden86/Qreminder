import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useAiExtract } from "@/hooks/use-ai";
import { useSettings } from "@/hooks/use-settings";
import { useI18n } from "@/i18n/I18nProvider";
import { DEFAULT_REMINDER_OFFSETS, type SubscriptionDraft } from "@/types/subscription";

interface AiExtractDialogProps {
  /** Called after user confirms — receives a full SubscriptionDraft ready to insert. */
  onAdd: (draft: SubscriptionDraft) => void;
  trigger?: React.ReactNode;
}

interface ExtractedResult {
  name?: string;
  amount?: number;
  currency?: string;
  nextRenewalDate?: string;
  paymentMethod?: string;
  billingCycle?: string;
  category?: string;
  error?: string;
  reason?: string;
}

const CYCLE_MAP: Record<string, "weekly" | "monthly" | "quarterly" | "semi-annual" | "annual"> = {
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  "semi-annual": "semi-annual",
  annual: "annual",
  yearly: "annual",
};

export function AiExtractDialog({ onAdd, trigger }: AiExtractDialogProps) {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const extract = useAiExtract();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractedResult | null>(null);
  // Editable copies of extracted fields so user can adjust before saving.
  const [editedName, setEditedName] = useState("");
  const [editedAmount, setEditedAmount] = useState("");
  const [editedCurrency, setEditedCurrency] = useState("CNY");
  const [editedDate, setEditedDate] = useState("");
  const [editedCycle, setEditedCycle] = useState("monthly");

  const aiEnabled = settings?.aiEnabled && settings?.aiApiKey;

  const reset = () => {
    setText("");
    setResult(null);
    setEditedName("");
    setEditedAmount("");
    setEditedDate("");
    setEditedCycle("monthly");
  };

  const handleExtract = async () => {
    if (!text.trim()) return;
    setResult(null);
    try {
      const data = await extract.mutateAsync(text);
      const extracted = data.result as ExtractedResult;
      if (extracted.error) {
        toast.error(extracted.reason || t("ai.extractFailed"));
        return;
      }
      setResult(extracted);
      setEditedName(extracted.name ?? "");
      setEditedAmount(typeof extracted.amount === "number" ? String(extracted.amount) : "");
      setEditedCurrency((extracted.currency ?? "CNY").toUpperCase());
      setEditedDate(extracted.nextRenewalDate ?? new Date().toISOString().slice(0, 10));
      const normalizedCycle = extracted.billingCycle
        ? CYCLE_MAP[extracted.billingCycle.toLowerCase()] ?? "monthly"
        : "monthly";
      setEditedCycle(normalizedCycle);
      toast.success(t("ai.extractSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ai.extractFailed"));
    }
  };

  const handleConfirm = () => {
    if (!result || !editedName.trim()) return;
    const amount = Number.parseFloat(editedAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error(t("ai.invalidAmount"));
      return;
    }
    const now = new Date().toISOString().slice(0, 10);
    const draft = {
      name: editedName.trim(),
      logo: "",
      price: amount,
      currency: editedCurrency.trim().toUpperCase() || "CNY",
      billingCycle: editedCycle as "weekly" | "monthly" | "quarterly" | "semi-annual" | "annual",
      customDays: null,
      category: result.category || "productivity",
      status: "active" as const,
      paymentMethod: result.paymentMethod || "",
      startDate: now,
      nextBillingDate: editedDate || now,
      autoCalculateNextBillingDate: true,
      trialEndDate: null,
      website: "",
      notes: text.slice(0, 200),
      tags: [] as string[],
      reminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
      extra: {},
    } as unknown as SubscriptionDraft;
    onAdd(draft);
    setOpen(false);
    reset();
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-1.5">
      <Sparkles className="h-3.5 w-3.5" />
      {t("ai.extract")}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("ai.extract")}
          </DialogTitle>
          <DialogDescription>{t("ai.extractDescription")}</DialogDescription>
        </DialogHeader>

        {!aiEnabled && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
            {t("ai.notConfigured")}
          </div>
        )}

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ai-extract-text">{t("ai.inputLabel")}</Label>
            <Textarea
              id="ai-extract-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("ai.extractPlaceholder")}
              className="min-h-[100px] border-border bg-secondary"
              disabled={!aiEnabled || extract.isPending}
            />
          </div>

          <Button
            type="button"
            onClick={handleExtract}
            disabled={!aiEnabled || !text.trim() || extract.isPending}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {extract.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("ai.extracting")}
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {t("ai.extractAction")}
              </>
            )}
          </Button>

          {result && !result.error && (
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <p className="mb-3 text-[12px] font-medium text-foreground">
                {t("ai.extractResult")} — {t("ai.editBeforeSave")}
              </p>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-edit-name" className="text-[11px]">{t("subscription.field.name")}</Label>
                  <Input
                    id="ai-edit-name"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 border-border bg-card text-[12px]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1.5 col-span-2">
                    <Label htmlFor="ai-edit-amount" className="text-[11px]">{t("subscription.field.price")}</Label>
                    <Input
                      id="ai-edit-amount"
                      type="number"
                      step="0.01"
                      value={editedAmount}
                      onChange={(e) => setEditedAmount(e.target.value)}
                      className="h-8 border-border bg-card text-[12px]"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ai-edit-currency" className="text-[11px]">{t("payments.colCurrency")}</Label>
                    <Input
                      id="ai-edit-currency"
                      value={editedCurrency}
                      onChange={(e) => setEditedCurrency(e.target.value.toUpperCase())}
                      maxLength={10}
                      className="h-8 border-border bg-card text-[12px]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ai-edit-date" className="text-[11px]">{t("subscription.field.nextBillingDate")}</Label>
                    <Input
                      id="ai-edit-date"
                      type="date"
                      value={editedDate}
                      onChange={(e) => setEditedDate(e.target.value)}
                      className="h-8 border-border bg-card text-[12px]"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ai-edit-cycle" className="text-[11px]">{t("subscription.field.billingCycle")}</Label>
                    <select
                      id="ai-edit-cycle"
                      value={editedCycle}
                      onChange={(e) => setEditedCycle(e.target.value)}
                      className="h-8 rounded-md border border-border bg-card px-2 text-[12px]"
                    >
                      <option value="weekly">weekly</option>
                      <option value="monthly">monthly</option>
                      <option value="quarterly">quarterly</option>
                      <option value="semi-annual">semi-annual</option>
                      <option value="annual">annual</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!result || Boolean(result.error) || !editedName.trim() || !editedAmount}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {t("ai.useExtracted")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
