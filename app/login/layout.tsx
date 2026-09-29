import type { Metadata } from "next";
import { BASE_URL, LOCALES, buildMetadata, localeFromHeaders, seoCopy, seoTitle } from "@/lib/seo";
import type { Locale } from "@/lib/i18n-context";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeFromHeaders();
  return {
    // The root layout already appends "— Stockwise" via the title template.
    ...buildMetadata({ locale, path: "/login", title: seoTitle(locale), description: seoCopy(locale).description }),
    authors: [{ name: "Stockwise", url: BASE_URL }],
    creator: "Stockwise",
    publisher: "Stockwise",
    category: "Business Software",
    verification: {
      // google: "your-google-site-verification-token",
    },
  };
}

const FEATURES: Record<Locale, string[]> = {
  sr: ["Upravljanje artiklima sa varijantama", "Prijem robe i skeniranje barkoda", "Analitika i grafikon aktivnosti", "Audit dnevnik promena stanja", "Uvoz iz CSV, XLS i XLSX", "Izvoz u Excel i PDF", "Javni katalog za Instagram", "Timski rad sa ulogama"],
  en: ["Product management with variants", "Stock receiving and barcode scanning", "Analytics and activity charts", "Audit log of stock changes", "Import from CSV, XLS and XLSX", "Export to Excel and PDF", "Public catalog for Instagram", "Team work with roles"],
  ru: ["Управление товарами с вариантами", "Приёмка товара и сканирование штрихкодов", "Аналитика и графики активности", "Журнал аудита изменений остатков", "Импорт из CSV, XLS и XLSX", "Экспорт в Excel и PDF", "Публичный каталог для Instagram", "Командная работа с ролями"],
  de: ["Produktverwaltung mit Varianten", "Wareneingang und Barcode-Scannen", "Analysen und Aktivitätsdiagramme", "Audit-Protokoll der Bestandsänderungen", "Import aus CSV, XLS und XLSX", "Export nach Excel und PDF", "Öffentlicher Katalog für Instagram", "Teamarbeit mit Rollen"],
  es: ["Gestión de productos con variantes", "Recepción de mercancía y escaneo de códigos de barras", "Analítica y gráficos de actividad", "Registro de auditoría de cambios de stock", "Importación desde CSV, XLS y XLSX", "Exportación a Excel y PDF", "Catálogo público para Instagram", "Trabajo en equipo con roles"],
  it: ["Gestione prodotti con varianti", "Ricevimento merci e scansione dei codici a barre", "Analisi e grafici di attività", "Registro di audit delle variazioni di magazzino", "Importazione da CSV, XLS e XLSX", "Esportazione in Excel e PDF", "Catalogo pubblico per Instagram", "Lavoro di squadra con ruoli"],
};

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const locale = await localeFromHeaders();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Stockwise",
    url: BASE_URL,
    description: seoCopy(locale).description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: LOCALES,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    featureList: FEATURES[locale],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
