import { useState } from "react";
import { UserPlus, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useSignupConfig, useUpdateSignupConfig } from "@/hooks/use-signup-config";
import { useI18n } from "@/i18n/I18nProvider";

export function RegistrationManagementSection() {
  const { t } = useI18n();
  const configQuery = useSignupConfig();
  const updateConfig = useUpdateSignupConfig();
  const [domainInput, setDomainInput] = useState("");

  const config = configQuery.data;

  if (configQuery.isPending) {
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-6">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            {t("settings.registration.title")}
          </h2>
        </div>
        <div className="h-20 animate-pulse rounded bg-muted" />
      </section>
    );
  }

  if (!config) return null;

  const handleToggleEnabled = () => {
    updateConfig.mutate({ ...config, enabled: !config.enabled });
  };

  const handleToggleUnrestricted = () => {
    updateConfig.mutate({ ...config, unrestricted: !config.unrestricted });
  };

  const handleAddDomain = () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain || config.allowedDomains.includes(domain)) return;
    updateConfig.mutate({
      ...config,
      allowedDomains: [...config.allowedDomains, domain],
    });
    setDomainInput("");
  };

  const handleRemoveDomain = (domain: string) => {
    updateConfig.mutate({
      ...config,
      allowedDomains: config.allowedDomains.filter((d) => d !== domain),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddDomain();
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-6">
        <UserPlus className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          {t("settings.registration.title")}
        </h2>
      </div>

      <div className="grid gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Label>{t("settings.registration.enableLabel")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.registration.enableHelp")}
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={updateConfig.isPending}
          />
        </div>

        {config.enabled && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("settings.registration.unrestrictedLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.registration.unrestrictedHelp")}
                </p>
              </div>
              <Switch
                checked={config.unrestricted}
                onCheckedChange={handleToggleUnrestricted}
                disabled={updateConfig.isPending}
              />
            </div>

            {!config.unrestricted && (
              <div className="grid gap-3">
                <Label>{t("settings.registration.allowedDomains")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.registration.allowedDomainsHelp")}
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="example.com"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 border-border bg-secondary"
                    disabled={updateConfig.isPending}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddDomain}
                    disabled={!domainInput.trim() || updateConfig.isPending}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {config.allowedDomains.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {config.allowedDomains.map((domain) => (
                      <Badge
                        key={domain}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {domain}
                        <button
                          type="button"
                          onClick={() => handleRemoveDomain(domain)}
                          className="ml-1 rounded-sm p-0.5 hover:bg-destructive/20 hover:text-destructive"
                          disabled={updateConfig.isPending}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
