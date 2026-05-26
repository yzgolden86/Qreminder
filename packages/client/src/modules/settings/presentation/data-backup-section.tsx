import { useEffect, useRef, useState } from "react";
import { Cloud, Database, Download, Upload, FileJson, FileSpreadsheet, Archive, CloudUpload, CloudDownload, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { ImportPreviewDialog } from "@/components/import-preview-dialog";
import { useI18n } from "@/i18n/I18nProvider";
import type { AppSettings } from "@/types/subscription";
import { LoadingButtonContent, type UpdateSetting } from "./settings-shared-controls";

type ImportType = "json" | "csv" | "zip";

interface ImportPreviewData {
  valid: boolean;
  schemaVersion?: number;
  exportedAt?: string;
  summary: {
    subscriptions: number;
    new: number;
    duplicate: number;
  };
  items: Array<{
    name: string;
    status: "new" | "duplicate";
  }>;
}

interface DataBackupSectionProps {
  settings: AppSettings;
  updateSetting: UpdateSetting;
}

function SecretInput({
  id,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Input
      id={id}
      type="password"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="border-border bg-secondary"
      autoComplete="off"
    />
  );
}

export function DataBackupSection({ settings, updateSetting }: DataBackupSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [importType, setImportType] = useState<ImportType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [webdavStatus, setWebdavStatus] = useState<{ reachable: boolean; backupCount?: number | undefined; error?: string | undefined } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const pendingFileRef = useRef<{ body: string | ArrayBuffer; type: ImportType } | null>(null);

  useEffect(() => {
    if (!settings.webdavEnabled || !settings.webdavUrl) {
      setWebdavStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/backup/webdav/status", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { configured: boolean; reachable: boolean; backupCount?: number; error?: string };
        if (cancelled || !data.configured) return;
        setWebdavStatus({ reachable: data.reachable, backupCount: data.backupCount, error: data.error });
      } catch {
        // silent — status check is informational only
      }
    })();
    return () => { cancelled = true; };
  }, [settings.webdavEnabled, settings.webdavUrl]);

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

    setBusy(`import-${importType}`);
    try {
      const body = importType === "zip" ? await file.arrayBuffer() : await file.text();
      let previewUrl = "";
      const headers: Record<string, string> = {};

      if (importType === "json") {
        previewUrl = "/api/import/json/preview";
        headers["Content-Type"] = "application/json";
      } else if (importType === "csv") {
        previewUrl = "/api/import/csv/preview";
        headers["Content-Type"] = "text/csv";
      } else {
        previewUrl = "/api/backup/zip/restore";
        headers["Content-Type"] = "application/zip";
      }

      if (importType === "zip") {
        const confirmMsg = t("backup.importConfirm");
        if (!window.confirm(confirmMsg)) {
          setImportType(null);
          setBusy(null);
          return;
        }
        const res = await fetch(previewUrl, {
          method: "POST",
          credentials: "include",
          headers,
          body,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as { imported?: number };
        toast.success(t("backup.importSuccess", { imported: data.imported ?? 0 }));
        await queryClient.invalidateQueries();
      } else {
        const res = await fetch(previewUrl, {
          method: "POST",
          credentials: "include",
          headers,
          body,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
        const preview = await res.json() as ImportPreviewData;
        pendingFileRef.current = { body: body as string, type: importType };
        setPreviewData(preview);
        setPreviewOpen(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
      setImportType(null);
    }
  };

  const handleImportConfirm = async (createBackup: boolean) => {
    const pending = pendingFileRef.current;
    if (!pending) return;

    setPreviewLoading(true);
    try {
      if (createBackup) {
        await fetch("/api/backup/zip", { credentials: "include" })
          .then((r) => r.blob())
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `qreminder-backup-before-import-${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          });
        toast.success(t("backup.backupCreated"));
      }

      const confirmUrl = pending.type === "json" ? "/api/import/json/confirm" : "/api/import/csv/confirm";
      const contentType = pending.type === "json" ? "application/json" : "text/csv";

      const res = await fetch(confirmUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": contentType },
        body: pending.body,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { imported?: number };
      toast.success(t("backup.importSuccess", { imported: data.imported ?? 0 }));
      await queryClient.invalidateQueries();
      setPreviewOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPreviewLoading(false);
      pendingFileRef.current = null;
    }
  };

  const handleWebdavBackup = async () => {
    setBusy("webdav-backup");
    try {
      const res = await fetch("/api/backup/webdav", { method: "POST", credentials: "include" });
      const data = await res.json() as { ok?: boolean; filename?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      toast.success(t("backup.webdavSuccess"));
      // Refresh status
      const statusRes = await fetch("/api/backup/webdav/status", { credentials: "include" });
      if (statusRes.ok) {
        const statusData = await statusRes.json() as { configured: boolean; reachable: boolean; backupCount?: number };
        if (statusData.configured) {
          setWebdavStatus({ reachable: statusData.reachable, backupCount: statusData.backupCount });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "WebDAV backup failed");
    } finally {
      setBusy(null);
    }
  };

  const handleWebdavRestore = async () => {
    if (!window.confirm(t("backup.importConfirm"))) return;
    setBusy("webdav-restore");
    try {
      const res = await fetch("/api/backup/webdav/restore", { method: "POST", credentials: "include" });
      const data = await res.json() as { ok?: boolean; imported?: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      toast.success(t("backup.webdavRestoreSuccess", { imported: data.imported ?? 0 }));
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "WebDAV restore failed");
    } finally {
      setBusy(null);
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

        <div className="rounded-lg border border-border bg-secondary/30 p-3 sm:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cloud className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-[13px] font-medium text-foreground">{t("backup.webdavTitle")}</h3>
              {webdavStatus ? (
                <span className={`text-[10px] rounded px-1.5 py-0.5 ${webdavStatus.reachable ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {webdavStatus.reachable
                    ? t("backup.webdavReachable", { count: webdavStatus.backupCount ?? 0 })
                    : t("backup.webdavUnreachable")}
                </span>
              ) : null}
            </div>
            <Switch
              checked={settings.webdavEnabled}
              onCheckedChange={(checked) => updateSetting("webdavEnabled", checked)}
              aria-label={t("backup.webdavEnable")}
            />
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">{t("backup.webdavHelp")}</p>

          {settings.webdavEnabled && (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="webdavUrl" className="text-[12px]">{t("backup.webdavUrl")}</Label>
                  <Input
                    id="webdavUrl"
                    placeholder="https://dav.example.com"
                    value={settings.webdavUrl}
                    onChange={(e) => updateSetting("webdavUrl", e.target.value)}
                    className="h-8 border-border bg-secondary text-[12px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="webdavPath" className="text-[12px]">{t("backup.webdavPath")}</Label>
                  <Input
                    id="webdavPath"
                    placeholder="/qreminder-backup/"
                    value={settings.webdavPath}
                    onChange={(e) => updateSetting("webdavPath", e.target.value)}
                    className="h-8 border-border bg-secondary text-[12px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="webdavUsername" className="text-[12px]">{t("backup.webdavUsername")}</Label>
                  <Input
                    id="webdavUsername"
                    placeholder="user@example.com"
                    value={settings.webdavUsername}
                    onChange={(e) => updateSetting("webdavUsername", e.target.value)}
                    className="h-8 border-border bg-secondary text-[12px]"
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="webdavPassword" className="text-[12px]">{t("backup.webdavPassword")}</Label>
                  <SecretInput
                    id="webdavPassword"
                    placeholder="••••••••"
                    value={settings.webdavPassword}
                    onChange={(e) => updateSetting("webdavPassword", e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("backup.webdavSaveFirst")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWebdavBackup}
                  disabled={busy !== null || !settings.webdavUrl || !settings.webdavUsername}
                  className="gap-1.5"
                >
                  <LoadingButtonContent loading={busy === "webdav-backup"} loadingLabel="...">
                    <CloudUpload className="h-3.5 w-3.5" />
                    {t("backup.webdavBackupNow")}
                  </LoadingButtonContent>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWebdavRestore}
                  disabled={busy !== null || !settings.webdavUrl || !settings.webdavUsername}
                  className="gap-1.5"
                >
                  <LoadingButtonContent loading={busy === "webdav-restore"} loadingLabel="...">
                    <CloudDownload className="h-3.5 w-3.5" />
                    {t("backup.webdavRestore")}
                  </LoadingButtonContent>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/backup/webdav/status", { credentials: "include" });
                      const data = await res.json() as { configured: boolean; reachable: boolean; backupCount?: number; error?: string };
                      if (data.configured) {
                        setWebdavStatus({ reachable: data.reachable, backupCount: data.backupCount, error: data.error });
                        toast.success(data.reachable
                          ? t("backup.webdavReachable", { count: data.backupCount ?? 0 })
                          : t("backup.webdavUnreachable"));
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Status check failed");
                    }
                  }}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("backup.webdavCheck")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ImportPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) pendingFileRef.current = null;
        }}
        preview={previewData}
        onConfirm={handleImportConfirm}
        loading={previewLoading}
      />
    </section>
  );
}
