/**
 * 订阅模板管理分区（设置页）。
 *
 * 列出当前工作空间的模板，支持删除。模板的创建入口有两个：
 * 1. 订阅卡片菜单「另存为模板」（继承订阅字段 + 通知渠道）
 * 2. 此处仅管理已有模板——刻意不做「从零建模板」表单，
 *    因为从真实订阅创建的模板字段质量远高于手填。
 */
import { useState } from "react";
import { LayoutTemplate, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "@/components/ui/sonner";
import { useTemplates, useDeleteTemplate } from "@/hooks/use-templates";
import { useI18n } from "@/i18n/I18nProvider";

export function TemplateManagerSection() {
  const { t } = useI18n();
  const templatesQuery = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const templates = templatesQuery.data ?? [];
  const pendingDelete = templates.find((tpl) => tpl.id === pendingDeleteId) ?? null;

  const handleConfirmDelete = () => {
    if (!pendingDeleteId) return;
    deleteTemplate.mutate(pendingDeleteId, {
      onSuccess: () => toast.success(t("template.deleteSuccess")),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : t("error.generic")),
    });
    setPendingDeleteId(null);
  };

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <LayoutTemplate className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">{t("template.managerTitle")}</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t("template.managerHint")}</p>

      {templates.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("template.managerEmpty")}</p>
      ) : (
        <div className="grid gap-2">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{tpl.name}</span>
                  {tpl.category && (
                    <Badge variant="outline" className="text-[10px]">{tpl.category}</Badge>
                  )}
                  {tpl.usageCount > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {t("template.usedCount", { count: tpl.usageCount })}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  {tpl.paymentMethod && <span>{tpl.paymentMethod}</span>}
                  {tpl.defaultChannels.length > 0 && (
                    <span>{t("template.channelCount", { count: tpl.defaultChannels.length })}</span>
                  )}
                  {tpl.tags.length > 0 && <span>{tpl.tags.join(", ")}</span>}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setPendingDeleteId(tpl.id)}
                aria-label={t("template.deleteAria", { name: tpl.name })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("template.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("template.deleteConfirmDescription", { name: pendingDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
