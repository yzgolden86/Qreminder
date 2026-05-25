/**
 * 从其他订阅管理工具导入。
 *
 * 支持的来源：
 * - Wallos（开源自托管订阅追踪器，https://github.com/ellite/Wallos）
 * - SubTracker（https://github.com/Smile-QWQ/SubTracker）
 *
 * 工作方式：用户上传对应工具导出的 JSON 文件，POST 到 /api/import/{wallos|subtracker}。
 * 后端按字段优先级映射并去重（按订阅名）。返回新增/跳过统计。
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { LoadingButtonContent } from "./settings-shared-controls";
import { useI18n } from "@/i18n/I18nProvider";

type Source = "wallos" | "subtracker";

export function ImportFromOtherToolsSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Source | null>(null);
  const [pendingSource, setPendingSource] = useState<Source | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trigger = (source: Source) => {
    setPendingSource(source);
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingSource) return;

    if (!window.confirm(t("externalImport.confirm", { tool: pendingSource }))) {
      setPendingSource(null);
      return;
    }

    setBusy(pendingSource);
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(t("externalImport.invalidJson"));
      }

      const res = await fetch(`/api/import/${pendingSource}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = (await res.json().catch(() => ({}))) as {
        imported?: number;
        skipped?: number;
        error?: string;
        errors?: string[];
      };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        t("externalImport.success", {
          imported: data.imported ?? 0,
          skipped: data.skipped ?? 0,
        }),
      );
      if ((data.errors?.length ?? 0) > 0) {
        toast.warning(t("externalImport.partialErrors", { count: data.errors!.length }));
      }
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
    } finally {
      setBusy(null);
      setPendingSource(null);
    }
  };

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">
          {t("externalImport.title")}
        </h2>
      </div>
      <p className="mb-4 text-[13px] text-muted-foreground">{t("externalImport.description")}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        className="hidden"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <ToolCard
          title="Wallos"
          description={t("externalImport.wallosHelp")}
          onClick={() => trigger("wallos")}
          loading={busy === "wallos"}
          disabled={busy !== null}
          label={t("externalImport.import")}
        />
        <ToolCard
          title="SubTracker"
          description={t("externalImport.subtrackerHelp")}
          onClick={() => trigger("subtracker")}
          loading={busy === "subtracker"}
          disabled={busy !== null}
          label={t("externalImport.import")}
        />
      </div>
    </section>
  );
}

interface ToolCardProps {
  title: string;
  description: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  label: string;
}

function ToolCard({ title, description, onClick, loading, disabled, label }: ToolCardProps) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
      <p className="mt-1 mb-3 text-[11px] text-muted-foreground">{description}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className="w-full gap-1.5"
      >
        <LoadingButtonContent loading={loading} loadingLabel="...">
          <Upload className="h-3.5 w-3.5" />
          {label}
        </LoadingButtonContent>
      </Button>
    </div>
  );
}
