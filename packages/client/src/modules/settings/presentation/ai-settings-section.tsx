import { Bot, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/I18nProvider";
import type { AppSettings } from "@/types/subscription";
import type { UpdateSetting } from "./settings-shared-controls";

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
              <Label htmlFor="aiApiEndpoint">API Endpoint</Label>
              <Input
                id="aiApiEndpoint"
                placeholder="https://api.openai.com/v1"
                value={settings.aiApiEndpoint}
                onChange={(e) => updateSetting("aiApiEndpoint", e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-[11px] text-muted-foreground">
                支持 OpenAI 兼容 API（OpenAI、Claude via proxy、本地模型等）
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aiApiKey">API Key</Label>
              <SecretInput
                id="aiApiKey"
                placeholder="sk-..."
                value={settings.aiApiKey}
                onChange={(e) => updateSetting("aiApiKey", e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="aiModel">Model</Label>
              <Input
                id="aiModel"
                placeholder="gpt-4o-mini"
                value={settings.aiModel}
                onChange={(e) => updateSetting("aiModel", e.target.value)}
                className="border-border bg-secondary"
              />
              <p className="text-[11px] text-muted-foreground">
                推荐: gpt-4o-mini (性价比), gpt-4o (准确度), claude-sonnet-4-6 (via proxy)
              </p>
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
              获取 OpenAI API Key
            </a>
          </div>
        </>
      )}
    </section>
  );
}
