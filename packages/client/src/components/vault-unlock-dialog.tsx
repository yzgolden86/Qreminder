/**
 * Unlock / setup dialog for the client-side vault (sensitive field encryption).
 *
 * Two modes:
 * - first-time setup: user picks a master password, we generate a salt and
 *   persist it to localStorage (so derivation is deterministic across sessions
 *   on this device) and to user settings (so derivation works on other devices
 *   too — TODO: needs settings hook integration in Phase 2.2 follow-up).
 * - normal unlock: user enters the master password, we re-derive the key.
 *
 * Salt is shown in the help text so a tech-savvy user can back it up — losing
 * the salt + losing the password = data unrecoverable.
 */
import { useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { useVault } from "@/lib/vault-context";
import { generateSalt } from "@/lib/crypto";
import { useI18n } from "@/i18n/I18nProvider";

const SALT_STORAGE_KEY = "qreminder_vault_salt_v1";

interface VaultUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VaultUnlockDialog({ open, onOpenChange }: VaultUnlockDialogProps) {
  const { t } = useI18n();
  const { unlock } = useVault();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // First-time setup vs normal unlock: detect from presence of salt in
  // localStorage. We don't sync salt to server in this minimal version;
  // user has to re-setup on a new device.
  const existingSalt = (() => {
    try {
      return localStorage.getItem(SALT_STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  const isFirstTime = !existingSalt;

  const handleSubmit = async () => {
    if (!password) return;
    if (isFirstTime && password !== confirm) {
      toast.error(t("vault.passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      let salt = existingSalt;
      if (!salt) {
        salt = generateSalt();
        try {
          localStorage.setItem(SALT_STORAGE_KEY, salt);
        } catch {
          toast.error(t("vault.storageUnavailable"));
          return;
        }
      }
      await unlock(password, salt);
      toast.success(isFirstTime ? t("vault.setupSuccess") : t("vault.unlockSuccess"));
      setPassword("");
      setConfirm("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("vault.unlockFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFirstTime ? <KeyRound className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-primary" />}
            {isFirstTime ? t("vault.setupTitle") : t("vault.unlockTitle")}
          </DialogTitle>
          <DialogDescription>
            {isFirstTime ? t("vault.setupDescription") : t("vault.unlockDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor="vault-pw">{t("vault.passwordLabel")}</Label>
            <Input
              id="vault-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="border-border bg-secondary"
              onKeyDown={(e) => {
                if (e.key === "Enter" && password && (!isFirstTime || password === confirm)) {
                  void handleSubmit();
                }
              }}
            />
          </div>
          {isFirstTime && (
            <div className="grid gap-2">
              <Label htmlFor="vault-confirm">{t("vault.confirmLabel")}</Label>
              <Input
                id="vault-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="border-border bg-secondary"
              />
            </div>
          )}
          {isFirstTime && (
            <p className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
              {t("vault.lostPasswordWarning")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || !password || (isFirstTime && password !== confirm)}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {busy ? t("common.saving") : isFirstTime ? t("vault.setupButton") : t("vault.unlockButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
