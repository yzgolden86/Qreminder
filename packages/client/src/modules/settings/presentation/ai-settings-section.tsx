import { useState } from "react";
import { Bot, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import type { AppSettings } from "@/types/subscription";
import type { UpdateSetting } from "./settings-shared-controls";
import { LoadingButtonContent } from "./settings-shared-controls";

interface AiSettingsSectionProps {
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

export function AiSettingsSection({ settings, updateSetting }: AiSettingsSectionProps) {
  const { t } = useI18n();
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const handleFetchModels = async () => {
    if (!settings.aiApiEndpoint || !settings.aiApiKey) {
      toast.error(t("ai.fetchModelsRequireCreds"));
      return;
    }
    setLoadingModels(true);
    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: settings.aiApiEndpoint,
          apiKey: settings.aiApiKey,
        }),
      });
      const data = await res.json() as { models?: string[]; message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      const list = data.models ?? [];
      setModels(list);
      if (list.length === 0) {
        toast.warning(t("ai.fetchModelsEmpty"));
      } else {
        toast.success(t("ai.fetchModelsSuccess", { count: list.length }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch models");
    } finally {
      setLoadingModels(false);
    }
  };

  const modelOptions = models.length > 0
    ? models.map((id) => ({ value: id, label: id }))
    : settings.aiModel
      ? [{ value: settings.aiModel, label: settings.aiModel }]
      : [];

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-[15px] font-semibold text-foreground">{t("ai.title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="aiEnabled" className="text-[13px] text-muted-foreground">
            {settings.aiEnabled ? t("common.enabled") : t("common.disabled")}
          </Label>
          <Switch
            id="aiEnabled"
            checked={settings.aiEnabled}
            onCheckedChange={(checked) => updateSetting("aiEnabled", checked)}
          />
        </div>
      </div>

      {settings.aiEnabled && (
        <>
          <p className="mb-4 text-[12px] text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
            {t("ai.privacyNotice")}
          </p>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="aiApiEndpoint">{t("ai.endpoint")}</Label>
              <Input
                id="aiApiEndpoint"
                placeholder="https://api.openai.com/v1"
                value={settings.aiApiEndpoint}
                onChange={(e) => updateSetting("aiApiEndpoint", e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-[11px] text-muted-foreground">{t("ai.endpointHelp")}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aiApiKey">{t("ai.apiKey")}</Label>
              <SecretInput
                id="aiApiKey"
                placeholder="sk-..."
                value={settings.aiApiKey}
                onChange={(e) => updateSetting("aiApiKey", e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="aiModel">{t("ai.model")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFetchModels}
                  disabled={loadingModels || !settings.aiApiEndpoint || !settings.aiApiKey}
                  className="h-7 gap-1.5"
                >
                  <LoadingButtonContent loading={loadingModels} loadingLabel={t("ai.fetchingModels")}>
                    <RefreshCw className="h-3 w-3" />
                    {t("ai.fetchModels")}
                  </LoadingButtonContent>
                </Button>
              </div>
              {modelOptions.length > 0 ? (
                <SearchableSelect
                  value={settings.aiModel}
                  onValueChange={(value) => updateSetting("aiModel", value)}
                  options={modelOptions}
                  placeholder={t("ai.modelPlaceholder")}
                  searchPlaceholder={t("ai.modelSearch")}
                  emptyMessage={t("ai.modelEmpty")}
                  className="w-full border-border bg-secondary"
                />
              ) : (
                <Input
                  id="aiModel"
                  placeholder="gpt-4o-mini"
                  value={settings.aiModel}
                  onChange={(e) => updateSetting("aiModel", e.target.value)}
                  className="border-border bg-secondary"
                />
              )}
              <p className="text-[11px] text-muted-foreground">{t("ai.modelHelp")}</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t("ai.getApiKey")}
            </a>
          </div>
        </>
      )}
    </section>
  );
}
