import type { Metadata } from "next";
import { buildMetadata, localeFromHeaders } from "@/lib/seo";
import type { Locale } from "@/lib/i18n-context";
import sr from "@/lib/i18n/sr.json";
import en from "@/lib/i18n/en.json";
import ru from "@/lib/i18n/ru.json";
import de from "@/lib/i18n/de.json";
import es from "@/lib/i18n/es.json";
import it from "@/lib/i18n/it.json";

const TRANSLATIONS: Record<Locale, Record<string, string>> = { sr, en, ru, de, es, it };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeFromHeaders();
  const dictionary = TRANSLATIONS[locale];
  return buildMetadata({ locale, path: "/terms", title: dictionary["legal.terms.title"], description: dictionary["legal.terms.intro"] });
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
