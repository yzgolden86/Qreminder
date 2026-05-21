import { useState } from "react";
import { UserPlus, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useSignupConfig, useUpdateSignupConfig } from "@/hooks/use-signup-config";
import { useI18n } from "@/i18n/I18nProvider";

// 常用邮箱域名：覆盖国内外主流个人邮箱供应商，按地区分组方便用户辨认。
const COMMON_EMAIL_DOMAINS: ReadonlyArray<{ domain: string; label: string }> = [
  { domain: "gmail.com", label: "Gmail" },
  { domain: "outlook.com", label: "Outlook" },
  { domain: "hotmail.com", label: "Hotmail" },
  { domain: "yahoo.com", label: "Yahoo" },
  { domain: "icloud.com", label: "iCloud" },
  { domain: "proton.me", label: "Proton" },
  { domain: "qq.com", label: "QQ 邮箱" },
  { domain: "163.com", label: "网易 163" },
  { domain: "126.com", label: "网易 126" },
  { domain: "foxmail.com", label: "Foxmail" },
  { domain: "sina.com", label: "新浪" },
  { domain: "139.com", label: "139 邮箱" },
];

const COMMON_DOMAIN_SET = new Set(COMMON_EMAIL_DOMAINS.map((d) => d.domain));

export function RegistrationManagementSection() {
  const { t } = useI18n();
  const configQuery = useSignupConfig();
  const updateConfig = useUpdateSignupConfig();
  const [domainInput, setDomainInput] = useState("");

  const config = configQuery.data;

  if (configQuery.isPending) {
    return (
      <section className="surface-card rounded-xl p-6">
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

  const handleToggleCommonDomain = (domain: string, nextChecked: boolean) => {
    const current = config.allowedDomains;
    const next = nextChecked
      ? current.includes(domain) ? current : [...current, domain]
      : current.filter((d) => d !== domain);
    if (next.length === current.length && nextChecked === current.includes(domain)) return;
    updateConfig.mutate({ ...config, allowedDomains: next });
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

  const customDomains = config.allowedDomains.filter((d) => !COMMON_DOMAIN_SET.has(d));

  return (
    <section className="surface-card rounded-xl p-6">
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
              <div className="grid gap-4">
                <div className="grid gap-3">
                  <Label>{t("settings.registration.commonDomains")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.registration.commonDomainsHelp")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {COMMON_EMAIL_DOMAINS.map(({ domain, label }) => {
                      const id = `common-domain-${domain}`;
                      const checked = config.allowedDomains.includes(domain);
                      return (
                        <label
                          key={domain}
                          htmlFor={id}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 transition-colors hover:bg-secondary"
                        >
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(value) => handleToggleCommonDomain(domain, value === true)}
                            disabled={updateConfig.isPending}
                          />
                          <span className="grid leading-tight">
                            <span className="text-sm font-medium text-foreground">{label}</span>
                            <span className="text-xs text-muted-foreground">@{domain}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

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
                  {customDomains.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {customDomains.map((domain) => (
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
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
