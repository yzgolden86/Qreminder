/**
 * 导入预览对话框
 *
 * 在确认导入前显示：
 * - 数据校验结果
 * - 新增/重复订阅统计
 * - 自动备份选项
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nProvider";

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

interface ImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ImportPreviewData | null;
  onConfirm: (createBackup: boolean) => Promise<void>;
  loading: boolean;
}

export function ImportPreviewDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
  loading,
}: ImportPreviewDialogProps) {
  const { t } = useI18n();
  const [createBackup, setCreateBackup] = useState(true);

  if (!preview) return null;

  const hasNew = preview.summary.new > 0;
  const hasDuplicates = preview.summary.duplicate > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            {t("backup.importPreviewTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("backup.importPreviewDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="text-xs text-muted-foreground">{t("backup.totalItems")}</div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                {preview.summary.subscriptions}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-xs text-emerald-600">{t("backup.newItems")}</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">
                {preview.summary.new}
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-xs text-amber-600">{t("backup.duplicateItems")}</div>
              <div className="mt-1 text-2xl font-bold text-amber-600">
                {preview.summary.duplicate}
              </div>
            </div>
          </div>

          {/* Warnings */}
          {hasDuplicates && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-amber-600">
                {t("backup.duplicateWarning", { count: preview.summary.duplicate })}
              </div>
            </div>
          )}

          {!hasNew && (
            <div className="flex gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-sm">
              <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-muted-foreground">
                {t("backup.noNewItems")}
              </div>
            </div>
          )}

          {/* Item List */}
          {preview.items.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-foreground">
                {t("backup.itemList")}
              </div>
              <div className="h-48 overflow-y-auto rounded-lg border border-border">
                <div className="p-3 space-y-1">
                  {preview.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/50"
                    >
                      <span className="truncate text-foreground">{item.name}</span>
                      {item.status === "new" ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("backup.statusNew")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {t("backup.statusDuplicate")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Auto Backup Option */}
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Checkbox
              id="create-backup"
              checked={createBackup}
              onCheckedChange={(checked) => setCreateBackup(checked === true)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <label
                htmlFor="create-backup"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                {t("backup.createBackupBeforeImport")}
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("backup.createBackupHint")}
              </p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-primary" />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void onConfirm(createBackup)}
            disabled={loading || !hasNew}
          >
            {loading ? t("backup.importing") : t("backup.confirmImport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
