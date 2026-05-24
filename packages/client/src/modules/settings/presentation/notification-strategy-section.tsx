import { useState } from "react";
import { Layers, Plus, Trash2, Pencil, MessageSquareCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  useNotificationTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  type NotificationTemplate,
} from "@/hooks/use-notification-strategy";
import { useI18n } from "@/i18n/I18nProvider";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/types/subscription";

export function NotificationStrategySection() {
  const { t } = useI18n();
  const templatesQuery = useNotificationTemplates();
  const templates = templatesQuery.data ?? [];
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTemplate.mutateAsync(deleteId);
      toast.success(t("notificationStrategy.deleteSuccess"));
    } catch {
      toast.error(t("error.generic"));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-[15px] font-semibold text-foreground">
            {t("notificationStrategy.title")}
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("notificationStrategy.addTemplate")}
        </Button>
      </div>
      <p className="mb-4 text-[12px] text-muted-foreground">
        {t("notificationStrategy.description")}
      </p>

      <div className="grid gap-3">
        <div className="rounded-md border border-border bg-secondary/30 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <MessageSquareCode className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[13px] font-medium text-foreground">
              {t("notificationStrategy.variablesTitle")}
            </h3>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("notificationStrategy.variablesHelp")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              "{{subscription.name}}",
              "{{subscription.amount}}",
              "{{subscription.currency}}",
              "{{subscription.nextRenewalDate}}",
              "{{subscription.category}}",
              "{{subscription.paymentMethod}}",
              "{{daysLeft}}",
            ].map((variable) => (
              <code
                key={variable}
                className="rounded bg-card px-1.5 py-0.5 text-[10px] font-mono text-primary"
              >
                {variable}
              </code>
            ))}
          </div>
        </div>

        {templatesQuery.isPending ? (
          <p className="text-[12px] text-muted-foreground">{t("common.loading")}</p>
        ) : templates.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {t("notificationStrategy.emptyHint")}
          </p>
        ) : (
          <div className="grid gap-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-md border border-border/60 bg-secondary/20 p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {template.scope}
                      </span>
                      {template.scopeId && (
                        <span className="text-[11px] text-muted-foreground">{template.scopeId}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setEditing(template)}
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(template.id)}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1.5 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">{t("notificationStrategy.titleField")}:</span>{" "}
                    <span className="text-foreground">{template.titleTemplate}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("notificationStrategy.bodyField")}:</span>{" "}
                    <span className="text-foreground">{template.bodyTemplate}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TemplateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={async (data) => {
          try {
            await createTemplate.mutateAsync(data);
            toast.success(t("notificationStrategy.createSuccess"));
            setAddOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("error.generic"));
          }
        }}
      />

      <TemplateDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        initialTemplate={editing}
        onSubmit={async (data) => {
          if (!editing) return;
          try {
            await updateTemplate.mutateAsync({ id: editing.id, ...data });
            toast.success(t("notificationStrategy.updateSuccess"));
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("error.generic"));
          }
        }}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notificationStrategy.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("notificationStrategy.deleteConfirmBody")}</AlertDialogDescription>
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
    </section>
  );
}

type Scope = "global" | "channel" | "subscription";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplate?: NotificationTemplate | null;
  onSubmit: (data: {
    scope: Scope;
    scopeId?: string;
    titleTemplate: string;
    bodyTemplate: string;
  }) => void | Promise<void>;
}

function TemplateDialog({ open, onOpenChange, initialTemplate, onSubmit }: TemplateDialogProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<Scope>(initialTemplate?.scope ?? "global");
  const [scopeId, setScopeId] = useState(initialTemplate?.scopeId ?? "");
  const [titleTemplate, setTitleTemplate] = useState(
    initialTemplate?.titleTemplate ?? "Qreminder: {{subscription.name}} 即将续费",
  );
  const [bodyTemplate, setBodyTemplate] = useState(
    initialTemplate?.bodyTemplate
      ?? "{{subscription.name}} 将在 {{daysLeft}} 天后续费\n金额: {{subscription.currency}} {{subscription.amount}}\n日期: {{subscription.nextRenewalDate}}",
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!titleTemplate.trim() || !bodyTemplate.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        scope,
        ...(scope !== "global" && scopeId ? { scopeId } : {}),
        titleTemplate: titleTemplate.trim(),
        bodyTemplate: bodyTemplate.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {initialTemplate ? t("notificationStrategy.editTemplate") : t("notificationStrategy.addTemplate")}
          </DialogTitle>
          <DialogDescription>{t("notificationStrategy.templateDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t("notificationStrategy.scope")}</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger className="border-border bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">global</SelectItem>
                  <SelectItem value="channel">channel</SelectItem>
                  <SelectItem value="subscription">subscription</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "channel" ? (
              <div className="grid gap-2">
                <Label>{t("notificationStrategy.scopeChannel")}</Label>
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger className="border-border bg-secondary">
                    <SelectValue placeholder={t("notificationStrategy.selectChannel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {channel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : scope === "subscription" ? (
              <div className="grid gap-2">
                <Label htmlFor="template-scope-id">{t("notificationStrategy.scopeSubscription")}</Label>
                <Input
                  id="template-scope-id"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder={t("notificationStrategy.subscriptionIdPlaceholder")}
                  className="border-border bg-secondary"
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="template-title">{t("notificationStrategy.titleField")}</Label>
            <Input
              id="template-title"
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              className="border-border bg-secondary"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="template-body">{t("notificationStrategy.bodyField")}</Label>
            <Textarea
              id="template-body"
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              rows={5}
              className="border-border bg-secondary font-mono text-[12px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!titleTemplate.trim() || !bodyTemplate.trim() || submitting}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {submitting ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
