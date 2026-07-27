/**
 * 服务器汇率快照面板。
 *
 * 展示后端 exchange_rates 表的覆盖情况（日期范围、币种数、记录数），
 * 并提供管理员手动刷新入口。与上方「实时汇率」的区别：实时汇率是浏览器
 * 端 24h 缓存、用于当前统计换算；服务器快照是每日 Cron 落库、用于支付
 * 记录的「付款当日汇率」历史口径。
 *
 * 自包含组件：内部用 react-query 拉取 /api/exchange-rates/coverage，
 * 不依赖 settings controller。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { DatabaseZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

const coverageSchema = z.object({
  earliestDate: z.string().nullable(),
  latestDate: z.string().nullable(),
  currencies: z.array(z.string()),
  totalRecords: z.number(),
});

const refreshResultSchema = z.object({
  date: z.string(),
  fetched: z.number(),
  skipped: z.number(),
  failed: z.number(),
  provider: z.string().nullable(),
  errors: z.array(z.string()),
});

export interface ExchangeRateHistoryPanelProps {
  /** 仅 admin 显示刷新按钮（后端也会校验角色）。 */
  isAdmin: boolean;
}

export function ExchangeRateHistoryPanel({ isAdmin }: ExchangeRateHistoryPanelProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const coverageQuery = useQuery({
    queryKey: ["exchange-rates", "coverage"],
    queryFn: () => apiFetch("/api/exchange-rates/coverage", coverageSchema),
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/exchange-rates/refresh", refreshResultSchema, {
        method: "POST",
        body: JSON.stringify({ force: true }),
      }),
    onSuccess: (result) => {
      if (result.fetched > 0) {
        toast.success(t("settings.rateSnapshot.refreshSuccess", { count: result.fetched }));
      } else if (result.errors.length > 0) {
        toast.error(t("settings.rateSnapshot.refreshFailed", { error: result.errors[0] ?? "" }));
      }
      void queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
    },
    onError: (error) => {
      toast.error(
        t("settings.rateSnapshot.refreshFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  });

  const coverage = coverageQuery.data;
  const hasData = coverage != null && coverage.totalRecords > 0;

  return (
    <div className="pt-4 border-t border-border">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">{t("settings.rateSnapshot.title")}</h3>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshMutation.isPending && "animate-spin")} />
            {refreshMutation.isPending
              ? t("settings.rateSnapshot.refreshing")
              : t("settings.rateSnapshot.refresh")}
          </Button>
        )}
      </div>

      {coverageQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">{t("settings.rateSnapshot.loading")}</p>
      ) : !hasData ? (
        <p className="text-xs text-muted-foreground">{t("settings.rateSnapshot.empty")}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-2.5 rounded-lg bg-secondary/50">
            <p className="text-[11px] text-muted-foreground">{t("settings.rateSnapshot.earliest")}</p>
            <p className="text-sm font-medium text-foreground">{coverage.earliestDate}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-secondary/50">
            <p className="text-[11px] text-muted-foreground">{t("settings.rateSnapshot.latest")}</p>
            <p className="text-sm font-medium text-foreground">{coverage.latestDate}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-secondary/50">
            <p className="text-[11px] text-muted-foreground">{t("settings.rateSnapshot.currencies")}</p>
            <p className="text-sm font-medium text-foreground">{coverage.currencies.length}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-secondary/50">
            <p className="text-[11px] text-muted-foreground">{t("settings.rateSnapshot.records")}</p>
            <p className="text-sm font-medium text-foreground">{coverage.totalRecords}</p>
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">{t("settings.rateSnapshot.hint")}</p>
    </div>
  );
}
