"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import sr from "./i18n/sr.json";
import en from "./i18n/en.json";
import ru from "./i18n/ru.json";

export type Locale = "sr" | "en" | "ru";

const TRANSLATIONS: Record<Locale, Record<string, string>> = { sr, en, ru };

export const LOCALE_LABELS: Record<Locale, string> = {
  sr: "Srpski 🇷🇸",
  en: "English 🇬🇧",
  ru: "Русский 🇷🇺",
};

const STORAGE_KEY = "inventory-locale";

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "sr",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("sr");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    // Read persisted preference after hydration to avoid server/client markup mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored && stored in TRANSLATIONS) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let str = TRANSLATIONS[locale][key] ?? TRANSLATIONS["en"][key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
