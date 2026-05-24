/**
 * Vault key React context — holds the derived AES key in memory for the
 * current session only. Master password and key never touch localStorage
 * (would survive a closed tab). sessionStorage holds only the master
 * password so re-deriving across page reloads works; closing the tab
 * clears everything.
 *
 * Salt and "vault enabled" flag live in user settings JSON so they sync
 * across devices, but the master password itself never leaves the browser.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { deriveKey } from "@/lib/crypto";

interface VaultContextValue {
  /** True once the user has unlocked the vault this session. */
  unlocked: boolean;
  /** Derived AES-GCM key, null until unlocked. */
  key: CryptoKey | null;
  /** Try to unlock with the given master password; throws on derivation failure. */
  unlock: (masterPassword: string, salt: string) => Promise<void>;
  /** Forget the master password & key (e.g. on logout or user request). */
  lock: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const STORAGE_KEY = "qreminder_vault_pw_v1";

export function VaultProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);

  const unlock = useCallback(async (masterPassword: string, salt: string) => {
    const derived = await deriveKey(masterPassword, salt);
    setKey(derived);
    try {
      sessionStorage.setItem(STORAGE_KEY, masterPassword);
    } catch {
      // SessionStorage may be unavailable (e.g. private browsing); the in-memory
      // key still works for this tab.
    }
  }, []);

  const lock = useCallback(() => {
    setKey(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
  }, []);

  // Auto-rehydrate on page reload if user already entered the password this session.
  useEffect(() => {
    let cancelled = false;
    let cachedPassword: string | null = null;
    try {
      cachedPassword = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      cachedPassword = null;
    }
    if (!cachedPassword) return;
    const salt = window.localStorage.getItem("qreminder_vault_salt_v1");
    if (!salt) return;
    void (async () => {
      try {
        const derived = await deriveKey(cachedPassword!, salt);
        if (!cancelled) setKey(derived);
      } catch { /* derivation failed; user can retry from UI */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<VaultContextValue>(
    () => ({ unlocked: key !== null, key, unlock, lock }),
    [key, unlock, lock],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside <VaultProvider>");
  return ctx;
}
