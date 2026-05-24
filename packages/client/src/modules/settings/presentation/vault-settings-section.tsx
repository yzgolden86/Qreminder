/**
 * 主密钥/敏感字段加密设置区。
 *
 * Settings 页里的入口：让用户设置主密钥、查看加密状态、锁定/解锁。
 * 加密 / 解密本身发生在使用了 EncryptedNotes 组件的地方（如订阅备注）。
 */
import { useState } from "react";
import { Lock, LockOpen, KeyRound, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVault } from "@/lib/vault-context";
import { VaultUnlockDialog } from "@/components/vault-unlock-dialog";
import { useI18n } from "@/i18n/I18nProvider";

const SALT_STORAGE_KEY = "qreminder_vault_salt_v1";

export function VaultSettingsSection() {
  const { t } = useI18n();
  const { unlocked, lock } = useVault();
  const [dialogOpen, setDialogOpen] = useState(false);

  const hasSetup = (() => {
    try {
      return Boolean(localStorage.getItem(SALT_STORAGE_KEY));
    } catch {
      return false;
    }
  })();

  const status: "not-set-up" | "locked" | "unlocked" = !hasSetup
    ? "not-set-up"
    : unlocked
      ? "unlocked"
      : "locked";

  const StatusIcon = status === "unlocked" ? LockOpen : status === "locked" ? Lock : KeyRound;
  const statusColor =
    status === "unlocked" ? "text-success" : status === "locked" ? "text-warning" : "text-muted-foreground";

  return (
    <section className="surface-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("vault.sectionTitle")}</h3>
      </div>

      <p className="mb-3 text-[12px] text-muted-foreground">
        {t("vault.sectionDescription")}
      </p>

      <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2.5">
        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
        <span className="text-[12px] text-foreground">
          {status === "not-set-up" && t("vault.statusNotSetUp")}
          {status === "locked" && t("vault.statusLocked")}
          {status === "unlocked" && t("vault.statusUnlocked")}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === "not-set-up" && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow">
            <KeyRound className="h-4 w-4" />
            {t("vault.setupButton")}
          </Button>
        )}
        {status === "locked" && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow">
            <LockOpen className="h-4 w-4" />
            {t("vault.unlockButton")}
          </Button>
        )}
        {status === "unlocked" && (
          <Button variant="outline" onClick={lock} className="gap-2">
            <Lock className="h-4 w-4" />
            {t("vault.lockButton")}
          </Button>
        )}
      </div>

      {status !== "not-set-up" && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
          <span>{t("vault.deviceScopedWarning")}</span>
        </p>
      )}

      <VaultUnlockDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  );
}
