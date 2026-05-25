/**
 * 智能洞察面板 — 重复订阅检测 + 可取消推荐。
 *
 * 与 [[inactive-subscriptions-panel]] 互补：
 * - InactivePanel 看 lastUsedAt（用户主动打卡）
 * - InsightsPanel 看名称/分类/价格的启发式（不依赖打卡，新用户也能用）
 *
 * 按需触发：用户点击「分析」按钮才发请求，避免每次进 dashboard 都跑后端。
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Sparkles, Loader2, AlertTriangle, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useDetectDuplicates,
  useCancelSuggestions,
  type DuplicatesResponse,
  type CancelSuggestionsResponse,
} from "@/hooks/use-insights";
import { useI18n } from "@/i18n/I18nProvider";
import { toast } from "@/components/ui/sonner";
import type { MessageKey } from "@/i18n/messages";

const REASON_CONFIDENCE_LABEL: Record<string, string> = {
  "same-name": "insights.confidence.high",
  "similar-name": "insights.confidence.medium",
  "same-category-price": "insights.confidence.low",
};

function ConfidencePill({ confidence }: { confidence: number }) {
  const { t } = useI18n();
  let cls = "bg-muted text-muted-foreground";
  let label = t("insights.confidence.low");
  if (confidence >= 0.85) {
    cls = "bg-destructive/15 text-destructive";
    label = t("insights.confidence.high");
  } else if (confidence >= 0.6) {
    cls = "bg-warning/15 text-warning";
    label = t("insights.confidence.medium");
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
  );
}

export function InsightsPanel() {
  const { t, formatCurrency } = useI18n();
  const detectDuplicates = useDetectDuplicates();
  const cancelSuggestions = useCancelSuggestions();
  const [duplicates, setDuplicates] = useState<DuplicatesResponse | null>(null);
  const [cancels, setCancels] = useState<CancelSuggestionsResponse | null>(null);
  const [dismissedGroups, setDismissedGroups] = useState<Set<number>>(new Set());
  const [dismissedCancels, setDismissedCancels] = useState<Set<string>>(new Set());

  const isLoading = detectDuplicates.isPending || cancelSuggestions.isPending;

  const handleAnalyze = async () => {
    setDismissedGroups(new Set());
    setDismissedCancels(new Set());
    try {
      const [dupRes, cancelRes] = await Promise.all([
        detectDuplicates.mutateAsync(),
        cancelSuggestions.mutateAsync(),
      ]);
      setDuplicates(dupRes);
      setCancels(cancelRes);
      if (dupRes.groups.length === 0 && cancelRes.suggestions.length === 0) {
        toast.success(t("insights.cleanReport"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("insights.error"));
    }
  };

  const visibleDuplicates = duplicates?.groups.filter((_, i) => !dismissedGroups.has(i)) ?? [];
  const visibleCancels = cancels?.suggestions.filter((s) => !dismissedCancels.has(s.subscriptionId)) ?? [];

  const hasRun = duplicates !== null || cancels !== null;
  const totalIssues = visibleDuplicates.length + visibleCancels.length;

  return (
    <div className="mb-4 sm:mb-6 surface-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("insights.title")}</h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAnalyze}
          disabled={isLoading}
          className="gap-1.5"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {hasRun ? t("insights.refresh") : t("insights.analyze")}
        </Button>
      </div>

      {!hasRun && (
        <p className="text-[12px] text-muted-foreground">{t("insights.hint")}</p>
      )}

      {hasRun && totalIssues === 0 && (
        <p className="text-[12px] text-muted-foreground">{t("insights.cleanReport")}</p>
      )}

      {visibleDuplicates.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground">
            <Copy className="h-3.5 w-3.5 text-warning" />
            {t("insights.duplicate.heading", { count: visibleDuplicates.length })}
          </h4>
          <div className="space-y-2">
            {visibleDuplicates.map((group) => {
              const originalIdx = duplicates!.groups.indexOf(group);
              return (
                <div
                  key={originalIdx}
                  className="relative rounded-md border border-border/60 bg-secondary/20 p-2.5"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setDismissedGroups((prev) => new Set(prev).add(originalIdx))
                    }
                    aria-label={t("common.dismiss")}
                    className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="mb-2 flex items-center gap-2 pr-5">
                    <ConfidencePill confidence={group.confidence} />
                    <span className="text-[11px] text-muted-foreground">
                      {t((REASON_CONFIDENCE_LABEL[group.reason] ?? "insights.confidence.low") as MessageKey)}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {group.members.map((m) => (
                      <li key={m.id}>
                        <Link
                          to={`/subscriptions?highlight=${encodeURIComponent(m.id)}`}
                          className="flex items-center justify-between rounded-sm px-1.5 py-1 hover:bg-secondary/40"
                        >
                          <span className="truncate text-[13px] text-foreground">
                            {m.name}
                            {m.category && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                · {m.category}
                              </span>
                            )}
                          </span>
                          <span className="ml-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                            {formatCurrency(m.price, m.currency)}
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visibleCancels.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            {t("insights.cancel.heading", { count: visibleCancels.length })}
          </h4>
          <div className="space-y-2">
            {visibleCancels.slice(0, 8).map((sug) => (
              <div
                key={sug.subscriptionId}
                className="relative rounded-md border border-border/60 bg-secondary/20 p-2.5"
              >
                <button
                  type="button"
                  onClick={() =>
                    setDismissedCancels((prev) => {
                      const next = new Set(prev);
                      next.add(sug.subscriptionId);
                      return next;
                    })
                  }
                  aria-label={t("common.dismiss")}
                  className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-start justify-between gap-3 pr-5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/subscriptions?highlight=${encodeURIComponent(sug.subscriptionId)}`}
                      className="block truncate text-[13px] font-medium text-foreground hover:underline"
                    >
                      {sug.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {sug.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {t(reason as MessageKey, {
                            days: sug.context.daysSinceLastUse ?? 0,
                            price: sug.context.monthlyEquivalentPrice ?? 0,
                            overdue: sug.context.trialOverdueDays ?? 0,
                          })}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <ConfidencePill confidence={sug.confidence} />
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      {formatCurrency(sug.price, sug.currency)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {visibleCancels.length > 8 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("insights.moreHidden", { count: visibleCancels.length - 8 })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
