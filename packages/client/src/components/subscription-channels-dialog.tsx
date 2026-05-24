import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import {
  useSubscriptionChannels,
  useSetSubscriptionChannels,
  useClearSubscriptionChannels,
} from "@/hooks/use-notification-strategy";
import { useSettings } from "@/hooks/use-settings";
import { useI18n } from "@/i18n/I18nProvider";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/types/subscription";

interface SubscriptionChannelsDialogProps {
  subscriptionId: string | null;
  subscriptionName?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionChannelsDialog({
  subscriptionId,
  subscriptionName,
  open,
  onOpenChange,
}: SubscriptionChannelsDialogProps) {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const { data: currentChannels } = useSubscriptionChannels(open ? subscriptionId ?? undefined : undefined);
  const setChannels = useSetSubscriptionChannels();
  const clearChannels = useClearSubscriptionChannels();

  const [selected, setSelected] = useState<NotificationChannel[]>([]);
  const [useDefault, setUseDefault] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (currentChannels && currentChannels.length > 0) {
      setSelected(currentChannels as NotificationChannel[]);
      setUseDefault(false);
    } else {
      setSelected([]);
      setUseDefault(true);
    }
  }, [currentChannels, open]);

  const enabledChannels = settings?.enabledChannels ?? [];

  const handleToggle = (channel: NotificationChannel, checked: boolean) => {
    setSelected((prev) => {
      if (checked) {
        return prev.includes(channel) ? prev : [...prev, channel];
      }
      return prev.filter((c) => c !== channel);
    });
  };

  const handleSave = async () => {
    if (!subscriptionId) return;
    try {
      if (useDefault || selected.length === 0) {
        await clearChannels.mutateAsync(subscriptionId);
        toast.success(t("notificationStrategy.channelClearedSuccess"));
      } else {
        await setChannels.mutateAsync({ subscriptionId, channels: selected });
        toast.success(t("notificationStrategy.channelSavedSuccess"));
      }
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
            <Bell className="h-4 w-4 text-primary" />
            {t("notificationStrategy.subscriptionChannels")}
          </DialogTitle>
          <DialogDescription>
            {subscriptionName
              ? t("notificationStrategy.subscriptionChannelsDescriptionFor", { name: subscriptionName })
              : t("notificationStrategy.subscriptionChannelsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2.5">
            <Checkbox
              id="sub-channels-default"
              checked={useDefault}
              onCheckedChange={(v) => setUseDefault(Boolean(v))}
            />
            <Label htmlFor="sub-channels-default" className="text-[12px] cursor-pointer">
              {t("notificationStrategy.useUserDefault")}
            </Label>
          </div>
          {!useDefault && (
            <div className="grid gap-2">
              <p className="text-[11px] text-muted-foreground">
                {t("notificationStrategy.selectChannelsHint")}
              </p>
              {NOTIFICATION_CHANNELS.map((channel) => {
                const enabled = enabledChannels.includes(channel);
                return (
                  <label
                    key={channel}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/20 p-2 hover:bg-secondary/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.includes(channel)}
                      onCheckedChange={(v) => handleToggle(channel, Boolean(v))}
                      disabled={!enabled}
                    />
                    <span className={`text-[12px] flex-1 ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                      {channel}
                    </span>
                    {!enabled && (
                      <span className="text-[10px] text-muted-foreground italic">
                        {t("notificationStrategy.channelDisabled")}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={setChannels.isPending || clearChannels.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {(setChannels.isPending || clearChannels.isPending) ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
