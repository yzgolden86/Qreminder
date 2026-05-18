import { getInitialLocale, type Locale } from "@/i18n/locales";

let currentLocale: Locale = getInitialLocale();

export function getApiLocale(): Locale {
  return currentLocale;
}

export function setApiLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocaleHeaders(): Record<string, string> {
  return {
    "Accept-Language": currentLocale,
    "X-Renewlet-Locale": currentLocale,
  };
}
