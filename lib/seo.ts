import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n-context";

/** Public site origin. Every canonical/hreflang URL is built from this. */
export const BASE_URL = "https://inventory-crm.vercel.app";

/** Maps our short locale codes to the BCP-47 tags used for hreflang/OG. */
export const LOCALE_TAGS: Record<Locale, { hreflang: string; og: string; htmlLang: string }> = {
  sr: { hreflang: "sr-RS", og: "sr_RS", htmlLang: "sr" },
  en: { hreflang: "en-US", og: "en_US", htmlLang: "en" },
  ru: { hreflang: "ru-RU", og: "ru_RU", htmlLang: "ru" },
  de: { hreflang: "de-DE", og: "de_DE", htmlLang: "de" },
  es: { hreflang: "es-ES", og: "es_ES", htmlLang: "es" },
  it: { hreflang: "it-IT", og: "it_IT", htmlLang: "it" },
};

export const LOCALES = Object.keys(LOCALE_TAGS) as Locale[];

const TRANSLATIONS: Record<Locale, Record<string, string>> = {
  sr: { title: "Stockwise — Upravljanje zalihama, prijem robe i prodaja u realnom vremenu", description: "Pratite stanje artikla, primajte robu, evidentirajte prodaju i analizirajte kretanje zaliha. Napravite besplatan javni katalog svoje radnje i podelite ga na Instagramu.", keywords: "upravljanje zalihama, evidencija robe, prijem robe, prodavnica, mali biznis, katalog radnje, programska oprema za radnju, CRM, analiza zaliha" },
  en: { title: "Stockwise — Inventory, stock receiving and sales in real time", description: "Track product stock, receive deliveries, record sales and analyse stock movement. Create a free public catalog for your shop and share it on Instagram.", keywords: "inventory management, stock control, inventory software, small business inventory, shop catalog, product catalog, retail inventory, stock analytics" },
  ru: { title: "Stockwise — Учёт товаров, приёмка и продажи в реальном времени", description: "Следите за остатками товаров, принимайте поставки, фиксируйте продажи и анализируйте движение запасов. Создайте бесплатный публичный каталог вашего магазина и поделитесь им в Instagram.", keywords: "управление запасами, учёт товаров, приёмка товара, программа для учёта товаров, складской учёт, каталог магазина, каталог товаров, аналитика запасов" },
  de: { title: "Stockwise — Lagerverwaltung, Wareneingang und Verkauf in Echtzeit", description: "Verwalten Sie Ihren Lagerbestand, empfangen Sie Lieferungen, erfassen Sie Verkäufe und analysieren Sie Bestandsbewegungen. Erstellen Sie einen kostenlosen öffentlichen Katalog für Ihr Geschäft und teilen Sie ihn auf Instagram.", keywords: "Lagerverwaltung, Lagerbestand, Wareneingang, Bestandsverwaltung Software, Geschäftskatalog, Produktkatalog, Einzelhandel Bestand, Bestandsanalyse" },
  es: { title: "Stockwise — Inventario, recepción de mercancía y ventas en tiempo real", description: "Controla el stock de tus productos, recibe mercancía, registra ventas y analiza el movimiento de inventario. Crea un catálogo público gratuito para tu tienda y compártelo en Instagram.", keywords: "gestión de inventario, control de stock, software de inventario, inventario para pymes, catálogo de tienda, catálogo de productos, inventario minorista, análisis de stock" },
  it: { title: "Stockwise — Inventario, ricevimento merci e vendite in tempo reale", description: "Monitora il magazzino dei tuoi prodotti, ricevi le consegne, registra le vendite e analizza il movimento dell inventario. Crea un catalogo pubblico gratuito per il tuo negozio e condividilo su Instagram.", keywords: "gestione magazzino, controllo scorte, software gestione magazzino, magazzino per piccole imprese, catalogo negozio, catalogo prodotti, inventario retail, analisi scorte" },
};

/** The English dictionary is the fallback for any missing key. */
function tr(locale: Locale, key: string): string {
  return TRANSLATIONS[locale][key] ?? TRANSLATIONS.en[key] ?? "";
}

/** Picks a locale from a `?lang=xx` search param, falling back to Serbian. */
export function localeFromParam(value: string | string[] | undefined): Locale {
  const raw = Array.isArray(value) ? value[0] : value;
  const code = (raw ?? "").toLowerCase().split("-")[0];
  return (LOCALES as string[]).includes(code) ? (code as Locale) : "sr";
}

/** Header name proxy.ts writes the resolved locale into. */
export const LOCALE_HEADER = "x-stokwise-locale";

export const LOCALE_COOKIE = "inventory-locale";

/**
 * Reads the locale that proxy.ts resolved from the URL or cookie. Layouts cannot access
 * searchParams, so the language has to travel through a request header to make
 * `<html lang>` and the metadata render on the server.
 */
export async function localeFromHeaders(): Promise<Locale> {
  const { headers } = await import("next/headers");
  const value = (await headers()).get(LOCALE_HEADER) ?? undefined;
  return localeFromParam(value);
}

interface BuildOptions {
  locale: Locale;
  /** Absolute or site-relative path of the page this metadata describes. */
  path?: string;
  title?: string;
  description?: string;
  /** `noindex` for pages that must not appear in search results. */
  noindex?: boolean;
}

/**
 * Builds locale-aware metadata: title, description, keywords, canonical URL and
 * the full hreflang set. Every URL is absolute so crawlers can resolve them
 * without needing `metadataBase`.
 */
export function buildMetadata({ locale, path = "/", title, description, noindex }: BuildOptions): Metadata {
  const { og } = LOCALE_TAGS[locale];

  // Each locale is a distinct URL (`?lang=xx`) so crawlers can index and link the
  // language variants separately. Serbian is the bare canonical URL; every other
  // locale appends its `?lang=` parameter.
  const urlFor = (l: Locale) => (l === "sr" ? `${BASE_URL}${path}` : `${BASE_URL}${path}?lang=${l}`);
  const canonical = urlFor(locale);
  const languages: Record<string, string> = {};
  for (const l of LOCALES) {
    languages[LOCALE_TAGS[l].hreflang] = urlFor(l);
  }
  languages["x-default"] = urlFor("sr");

  return {
    title,
    description,
    keywords: tr(locale, "keywords").split(",").map((k) => k.trim()).filter(Boolean),
    applicationName: "Stockwise",
    referrer: "origin-when-cross-origin",
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      type: "website",
      url: urlFor(locale),
      siteName: "Stockwise",
      locale: og,
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_TAGS[l].og),
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 } },
  };
}

/** Localized title/description used as defaults when no override is passed. */
export function seoCopy(locale: Locale): { title: string; description: string } {
  return { title: tr(locale, "title"), description: tr(locale, "description") };
}

/**
 * Title without the brand prefix, for pages that sit under the root layout's
 * `%s — Stockwise` template (which would otherwise repeat the brand).
 */
export function seoTitle(locale: Locale): string {
  return tr(locale, "title").replace(/^Stockwise\s*[—–-]\s*/, "");
}
