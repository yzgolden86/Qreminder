import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { usePwaInstall } from "@/pwa/use-pwa-install";

export function PwaInstallPrompt() {
  const { t } = useI18n();
  const { variant, promptInstall, dismiss, canPromptDirectly } = usePwaInstall();

  if (variant === null) return null;

  const description =
    variant === "ios"
      ? t("pwa.installDescriptionIos")
      : t("pwa.installDescriptionAndroid");

  return (
    <div
      role="dialog"
      aria-label={t("pwa.installTitle")}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md sm:left-auto sm:right-4 sm:bottom-4 sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {variant === "ios" ? (
            <Share className="h-5 w-5" />
          ) : (
            <Download className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            {t("pwa.installTitle")}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
          {canPromptDirectly && (
            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void promptInstall();
                }}
              >
                {t("pwa.installAction")}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                {t("pwa.installLater")}
              </Button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
