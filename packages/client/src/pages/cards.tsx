import { CreditCard } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export default function Cards() {
  const { t } = useI18n();

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("nav.cards")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("cards.subtitle")}</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
          <CreditCard className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">{t("cards.emptyTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("cards.emptyDescription")}</p>
      </div>
    </>
  );
}
