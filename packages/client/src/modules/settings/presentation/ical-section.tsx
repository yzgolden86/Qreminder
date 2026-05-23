import { useState } from "react";
import { CalendarDays, Copy, RefreshCw, Link2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { apiFetch } from "@/lib/api-client";
import type { AppSettings } from "@/types/subscription";
import { LoadingButtonContent } from "./settings-shared-controls";

interface IcalSectionProps {
  settings: AppSettings;
}

export function IcalSection({ settings }: IcalSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const icalToken = (settings as unknown as Record<string, unknown>)["icalToken"] as string | undefined;
  const hasToken = Boolean(icalToken?.trim());

  const icalUrl = hasToken
    ? `${window.location.origin}/api/ical/${icalToken}`
    : "";

  const generateOrReset = async () => {
    if (hasToken) {
      const confirmed = window.confirm(t("settings.ical.resetConfirm"));
      if (!confirmed) return;
    }
    setLoading(true);
    try {
      await apiFetch(
        "/api/settings/ical/reset-token",
        z.object({ icalToken: z.string() }),
        { method: "POST" },
      );
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("settings.ical.copied"));
    } catch {
      toast.error("Failed to generate iCal token");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!icalUrl) return;
    try {
      await navigator.clipboard.writeText(icalUrl);
      toast.success(t("settings.ical.copied"));
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">{t("settings.ical.title")}</h2>
      </div>
      <p className="mb-4 text-[13px] text-muted-foreground">{t("settings.ical.description")}</p>

      {hasToken ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={icalUrl}
              className="flex-1 border-border bg-secondary font-mono text-xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button variant="outline" size="icon" onClick={copyLink} aria-label={t("settings.ical.copyLink")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">{t("settings.ical.hint")}</p>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={generateOrReset} disabled={loading} className="gap-1.5">
              <LoadingButtonContent loading={loading} loadingLabel="...">
                <RefreshCw className="h-3.5 w-3.5" />
                {t("settings.ical.resetToken")}
              </LoadingButtonContent>
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={generateOrReset} disabled={loading} className="gap-1.5">
          <LoadingButtonContent loading={loading} loadingLabel="...">
            <Link2 className="h-4 w-4" />
            {t("settings.ical.generateToken")}
          </LoadingButtonContent>
        </Button>
      )}
    </section>
  );
}
