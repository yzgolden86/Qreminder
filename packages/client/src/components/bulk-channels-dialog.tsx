/**
 * 批量分配通知渠道弹窗。
 *
 * 用法：在订阅列表批量选中模式下，点击"批量渠道"按钮打开本对话框；
 * 用户选中要应用的通知渠道，确认后 PUT /strategy/channels/bulk。
 *
 * 安全设计：overwrite 默认 false（即跳过已配置过自定义渠道的订阅），
 * 用户需要主动勾选「覆盖已有」才会覆盖。避免一次操作改掉精心配置的少量例外。
 */
import { useState, useEffect } from "react";
import { Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useBulkAssignChannels } from "@/hooks/use-notification-strategy";
import { useI18n } from "@/i18n/I18nProvider";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/types/subscription";

interface BulkChannelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionIds: string[];
  onSuccess?: () => void;
}

export function BulkChannelsDialog({
  open,
  onOpenChange,
  subscriptionIds,
  onSuccess,
}: BulkChannelsDialogProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<NotificationChannel[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const bulkAssign = useBulkAssignChannels();

  useEffect(() => {
    if (open) {
      setSelected([]);
      setOverwrite(false);
    }
  }, [open]);

  const toggle = (channel: NotificationChannel) => {
    setSelected((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  };

  const handleApply = async () => {
    try {
      const result = await bulkAssign.mutateAsync({
        subscriptionIds,
        channels: selected,
        overwrite,
      });
      toast.success(
        t("bulkChannels.appliedSummary", {
          applied: result.applied,
          skipped: result.skipped,
        }),
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            {t("bulkChannels.title")}
          </DialogTitle>
          <DialogDescription>
            {t("bulkChannels.description", { count: subscriptionIds.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t("bulkChannels.channelsLabel")}</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-secondary/40 p-3">
              {NOTIFICATION_CHANNELS.map((channel) => (
                <label
                  key={channel}
                  className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground"
                >
                  <Checkbox
                    checked={selected.includes(channel)}
                    onCheckedChange={() => toggle(channel)}
                  />
                  {channel}
                </label>
              ))}
            </div>
          </div>
          <Label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
            <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
            <span>
              {t("bulkChannels.overwrite")}
              <span className="ml-1 text-[11px] text-muted-foreground">
                {t("bulkChannels.overwriteHint")}
              </span>
            </span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkAssign.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleApply}
            disabled={selected.length === 0 || bulkAssign.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {bulkAssign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("bulkChannels.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
