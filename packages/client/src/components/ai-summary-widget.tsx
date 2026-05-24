import { useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAiSummary } from "@/hooks/use-ai";
import { useSettings } from "@/hooks/use-settings";
import { useI18n } from "@/i18n/I18nProvider";

export function AiSummaryWidget() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const summary = useAiSummary();
  const [text, setText] = useState<string | null>(null);

  const aiEnabled = settings?.aiEnabled && settings?.aiApiKey;
  if (!aiEnabled) return null;

  const handleGenerate = async () => {
    try {
      const data = await summary.mutateAsync();
      setText(data.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("ai.summaryFailed"));
    }
  };

  return (
    <div className="mb-4 sm:mb-6 surface-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("ai.summary")}</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={summary.isPending}
          className="h-7 gap-1.5"
        >
          {summary.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("ai.summaryGenerating")}
            </>
          ) : (
            <>
              {text ? <RefreshCw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {text ? t("ai.regenerate") : t("ai.summaryAction")}
            </>
          )}
        </Button>
      </div>

      {text ? (
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
          <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground font-sans">
            {text}
          </pre>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">{t("ai.summaryHint")}</p>
      )}
    </div>
  );
}
