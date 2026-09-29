"use client";

import { createContext, useContext, useSyncExternalStore, useCallback } from "react";
import sr from "./i18n/sr.json";
import en from "./i18n/en.json";
import ru from "./i18n/ru.json";
import de from "./i18n/de.json";
import es from "./i18n/es.json";
import it from "./i18n/it.json";

export type Locale = "sr" | "en" | "ru" | "de" | "es" | "it";

const TRANSLATIONS: Record<Locale, Record<string, string>> = { sr, en, ru, de, es, it };

export const LOCALE_LABELS: Record<Locale, string> = {
  sr: "Srpski 🇷🇸",
  en: "English 🇬🇧",
  ru: "Русский 🇷🇺",
  de: "Deutsch 🇩🇪",
  es: "Español 🇪🇸",
  it: "Italiano 🇮🇹",
};

const STORAGE_KEY = "inventory-locale";

/** Emitted whenever the stored language changes, so open tabs stay in sync. */
const CHANGE_EVENT = "inventory-locale-change";

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "sr";
  // An explicit ?lang= in the URL wins: that is how crawlers and shared links
  // request a language, and it has to work without a stored preference.
  // Read from window instead of useSearchParams so the provider does not force
  // every page into a Suspense boundary.
  const fromUrl = new URLSearchParams(window.location.search).get("lang")?.toLowerCase().split("-")[0];
  if (fromUrl && fromUrl in TRANSLATIONS) return fromUrl as Locale;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored in TRANSLATIONS ? (stored as Locale) : "sr";
}

const localeStore = {
  subscribe(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    // Another tab changing the language should repaint this one too.
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  },
  get(): Locale {
    // Cached so the value stays referentially stable between renders;
    // useSyncExternalStore only re-reads when subscribe notifies a change.
    if (cachedLocale === null) cachedLocale = readStoredLocale();
    return cachedLocale;
  },
  set(locale: Locale) {
    cachedLocale = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
    // Keep the URL shareable in the same language the visitor picked — including
    // Serbian (?lang=sr), so every language behaves consistently. A full
    // navigation is used instead of replaceState so the server re-renders the
    // <html lang> and OpenGraph/browser-card metadata for the new language.
    const url = new URL(window.location.href);
    url.searchParams.set("lang", locale);
    window.location.href = url.toString();
  },
};

let cachedLocale: Locale | null = null;

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
  // The language lives outside React (URL + localStorage), so the external-store
  // contract fits better than mirroring it into state with an effect.
  const locale = useSyncExternalStore(localeStore.subscribe, localeStore.get, () => "sr" as Locale);
  const setLocale = localeStore.set;

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
