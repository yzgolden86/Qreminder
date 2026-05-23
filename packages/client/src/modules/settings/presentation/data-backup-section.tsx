import { useRef, useState } from "react";
import { Database, Download, Upload, FileJson, FileSpreadsheet, Archive } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { LoadingButtonContent } from "./settings-shared-controls";

type ImportType = "json" | "csv" | "zip";

export function DataBackupSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [importType, setImportType] = useState<ImportType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadFile = async (url: string, filename: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  };

  const handleExport = async (kind: "json" | "csv" | "zip") => {
    setBusy(kind);
    try {
      if (kind === "json") {
        await downloadFile("/api/export/json", "qreminder-export.json");
      } else if (kind === "csv") {
        await downloadFile("/api/export/subscriptions.csv", "qreminder-subscriptions.csv");
      } else {
        await downloadFile("/api/backup/zip", "qreminder-backup.zip");
      }
      toast.success(t("backup.exportSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const triggerImport = (type: ImportType) => {
    setImportType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !importType) return;

    const confirmMsg = t("backup.importConfirm");
    if (!window.confirm(confirmMsg)) {
      setImportType(null);
      return;
    }

    setBusy(`import-${importType}`);
    try {
      let url = "";
      let body: BodyInit;
      let headers: Record<string, string> = {};

      if (importType === "json") {
        url = "/api/import/json/confirm";
        body = await file.text();
        headers["Content-Type"] = "application/json";
      } else if (importType === "csv") {
        url = "/api/import/csv/confirm";
        body = await file.text();
        headers["Content-Type"] = "text/csv";
      } else {
        url = "/api/backup/zip/restore";
        body = await file.arrayBuffer();
        headers["Content-Type"] = "application/zip";
      }

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { imported?: number; skipped?: number };
      toast.success(t("backup.importSuccess", {
        imported: typeof data.imported === "number" ? data.imported :
          (data as unknown as { imported: { subscriptions: number } }).imported?.subscriptions ?? 0,
      }));
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
      setImportType(null);
    }
  };

  const acceptType = importType === "json" ? "application/json" :
    importType === "csv" ? ".csv,text/csv" : ".zip,application/zip";

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Database className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">{t("backup.title")}</h2>
      </div>
      <p className="mb-4 text-[13px] text-muted-foreground">{t("backup.description")}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptType}
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <FileJson className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[13px] font-medium text-foreground">{t("backup.jsonTitle")}</h3>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">{t("backup.jsonHelp")}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={busy !== null} className="flex-1 gap-1.5">
              <LoadingButtonContent loading={busy === "json"} loadingLabel="...">
                <Download className="h-3.5 w-3.5" />
                {t("backup.export")}
              </LoadingButtonContent>
            </Button>
            <Button variant="outline" size="sm" onClick={() => triggerImport("json")} disabled={busy !== null} className="flex-1 gap-1.5">
              <LoadingButtonContent loading={busy === "import-json"} loadingLabel="...">
                <Upload className="h-3.5 w-3.5" />
                {t("backup.import")}
              </LoadingButtonContent>
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[13px] font-medium text-foreground">{t("backup.csvTitle")}</h3>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">{t("backup.csvHelp")}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={busy !== null} className="flex-1 gap-1.5">
              <LoadingButtonContent loading={busy === "csv"} loadingLabel="...">
                <Download className="h-3.5 w-3.5" />
                {t("backup.export")}
              </LoadingButtonContent>
            </Button>
            <Button variant="outline" size="sm" onClick={() => triggerImport("csv")} disabled={busy !== null} className="flex-1 gap-1.5">
              <LoadingButtonContent loading={busy === "import-csv"} loadingLabel="...">
                <Upload className="h-3.5 w-3.5" />
                {t("backup.import")}
              </LoadingButtonContent>
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-3 sm:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Archive className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[13px] font-medium text-foreground">{t("backup.zipTitle")}</h3>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">{t("backup.zipHelp")}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("zip")} disabled={busy !== null} className="flex-1 gap-1.5">
              <LoadingButtonContent loading={busy === "zip"} loadingLabel="...">
                <Download className="h-3.5 w-3.5" />
                {t("backup.exportFull")}
              </LoadingButtonContent>
            </Button>
            <Button variant="outline" size="sm" onClick={() => triggerImport("zip")} disabled={busy !== null} className="flex-1 gap-1.5">
              <LoadingButtonContent loading={busy === "import-zip"} loadingLabel="...">
                <Upload className="h-3.5 w-3.5" />
                {t("backup.restoreFull")}
              </LoadingButtonContent>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
