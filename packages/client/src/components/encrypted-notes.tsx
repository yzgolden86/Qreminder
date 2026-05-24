/**
 * Encrypted-notes display widget.
 *
 * Shows either the decrypted plaintext (if vault unlocked) or a "🔒 Click to
 * unlock" placeholder (if locked or not yet attempted). Decryption happens on
 * mount once the key is available; failure shows a small error chip.
 */
import { useEffect, useState } from "react";
import { Lock, LockOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVault } from "@/lib/vault-context";
import { decrypt, isEncrypted } from "@/lib/crypto";
import { useI18n } from "@/i18n/I18nProvider";

interface EncryptedNotesProps {
  value: string;
  onUnlockRequest: () => void;
}

export function EncryptedNotes({ value, onUnlockRequest }: EncryptedNotesProps) {
  const { t } = useI18n();
  const { key } = useVault();
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEncrypted(value)) {
      setPlaintext(value);
      return;
    }
    if (!key) {
      setPlaintext(null);
      return;
    }
    let cancelled = false;
    void decrypt(value, key)
      .then((decoded) => { if (!cancelled) { setPlaintext(decoded); setError(null); } })
      .catch((err) => {
        if (cancelled) return;
        setPlaintext(null);
        setError(err instanceof Error ? err.message : "decryption failed");
      });
    return () => { cancelled = true; };
  }, [value, key]);

  if (!isEncrypted(value)) {
    return <span className="text-[12px] text-muted-foreground">{value}</span>;
  }

  if (plaintext !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px]">
        <LockOpen className="h-3 w-3 text-success" aria-hidden />
        <span className="text-foreground">{plaintext}</span>
      </span>
    );
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
        <AlertCircle className="h-3 w-3" aria-hidden />
        {t("vault.decryptError")}
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onUnlockRequest}
      className="h-auto gap-1 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
    >
      <Lock className="h-3 w-3" aria-hidden />
      {t("vault.encryptedLocked")}
    </Button>
  );
}
