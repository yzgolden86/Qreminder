import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setApiLocale } from "@/i18n/api-locale";
import { getInitialLocale, isLocale, localizedLabel, writeStoredLocale, type Locale, type LocalizedLabels } from "@/i18n/locales";
import { translate, type MessageKey } from "@/i18n/messages";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { authClient } from "@/lib/auth-client";
import { formatCurrency as formatCurrencyValue } from "@/lib/currency";
import { toPlainDate, type DateOnly } from "@/lib/time/date-only";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale, options?: { persist?: boolean; markAsSaved?: boolean }) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  formatDateOnly: (date: DateOnly | string, style?: "short" | "monthDay" | "full") => string;
  formatDateTime: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (amount: number, currency: string) => string;
  label: (labels: LocalizedLabels) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

function createFallbackI18nValue(): I18nContextValue {
  const locale = getInitialLocale();
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);
  return {
    locale,
    setLocale: () => undefined,
    t,
    formatDateOnly: (date, style = "short") => {
      const value = toPlainDate(date);
      const parts = {
        year: value.year,
        month: String(value.month).padStart(style === "full" && locale === "en-US" ? 2 : 1, "0"),
        day: String(value.day).padStart(style === "full" && locale === "en-US" ? 2 : 1, "0"),
      };
      if (style === "monthDay") return t("date.monthDay", parts);
      if (style === "full") return t("date.full", parts);
      return t("date.short", parts);
    },
    formatDateTime: (date, options) => {
      const valueDate = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(valueDate.getTime())) return String(date);
      return new Intl.DateTimeFormat(locale, options).format(valueDate);
    },
    formatNumber: (valueNumber, options) => new Intl.NumberFormat(locale, options).format(valueNumber),
    formatCurrency: (amount, currency) => formatCurrencyValue(amount, currency, locale),
    label: (labelSet) => localizedLabel(labelSet, locale),
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale());
  const hasLocalPreviewRef = useRef(false);
  const { data: settings } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    applyDocumentLocale(locale);
    if (hasLocalPreviewRef.current) return;
    setApiLocale(locale);
    writeStoredLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!settings?.locale || settings.locale === locale) return;
    if (hasLocalPreviewRef.current) return;
    setLocaleState(settings.locale);
  }, [locale, settings?.locale]);

  const setLocale = useCallback(
    (nextLocale: Locale, options: { persist?: boolean; markAsSaved?: boolean } = {}) => {
      if (!isLocale(nextLocale)) return;
      const shouldPersist = options.persist ?? true;
      setLocaleState(nextLocale);

      if (!shouldPersist) {
        hasLocalPreviewRef.current = !options.markAsSaved;
        if (options.markAsSaved) {
          setApiLocale(nextLocale);
          writeStoredLocale(nextLocale);
          applyDocumentLocale(nextLocale);
        }
        return;
      }

      hasLocalPreviewRef.current = false;
      queryClient.setQueryData(["settings"], (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...current, locale: nextLocale };
      });

      if (userId) {
        updateSettings({ locale: nextLocale });
      }
    },
    [queryClient, updateSettings, userId],
  );

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params);

    return {
      locale,
      setLocale,
      t,
      formatDateOnly: (date, style = "short") => {
        const value = toPlainDate(date);
        const parts = {
          year: value.year,
          month: String(value.month).padStart(style === "full" && locale === "en-US" ? 2 : 1, "0"),
          day: String(value.day).padStart(style === "full" && locale === "en-US" ? 2 : 1, "0"),
        };
        if (style === "monthDay") return t("date.monthDay", parts);
        if (style === "full") return t("date.full", parts);
        return t("date.short", parts);
      },
      formatDateTime: (date, options) => {
        const valueDate = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(valueDate.getTime())) return String(date);
        return new Intl.DateTimeFormat(locale, options).format(valueDate);
      },
      formatNumber: (valueNumber, options) => new Intl.NumberFormat(locale, options).format(valueNumber),
      formatCurrency: (amount, currency) => formatCurrencyValue(amount, currency, locale),
      label: (labelSet) => localizedLabel(labelSet, locale),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    return createFallbackI18nValue();
  }
  return context;
}
