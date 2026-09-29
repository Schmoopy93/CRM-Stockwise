import type { Metadata } from "next";
import Script from "next/script";

const BASE_URL = "https://inventory-crm.vercel.app";

export const metadata: Metadata = {
  title: "Inventory CRM — Upravljanje zalihama u realnom vremenu",
  description: "Pratite stanje artikala, primajte robu, analizirajte kretanje zaliha i izvozite izveštaje. Jednostavno upravljanje radnjom za vas i vaš tim.",
  keywords: ["inventory management", "upravljanje zalihama", "zalihe", "CRM", "radnja", "stanje robe", "prijem robe", "analitika zaliha", "uvoz artikala"],
  authors: [{ name: "Inventory CRM", url: BASE_URL }],
  creator: "Inventory CRM",
  publisher: "Inventory CRM",
  category: "Business Software",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
  },
  alternates: {
    canonical: BASE_URL,
    languages: {
      "sr-RS": BASE_URL,
      "en-US": `${BASE_URL}?lang=en`,
      "ru-RU": `${BASE_URL}?lang=ru`,
    },
  },
  openGraph: {
    type: "website",
    url: BASE_URL,
    title: "Inventory CRM — Upravljanje zalihama u realnom vremenu",
    description: "Pratite stanje artikala, primajte robu, analizirajte kretanje zaliha i izvozite izveštaje za vašu radnju.",
    siteName: "Inventory CRM",
    locale: "sr_RS",
    alternateLocale: ["en_US", "ru_RU"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inventory CRM — Upravljanje zalihama u realnom vremenu",
    description: "Pratite stanje artikala, primajte robu, analizirajte kretanje zaliha i izvozite izveštaje za vašu radnju.",
  },
  verification: {
    // google: "your-google-site-verification-token",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Inventory CRM",
  url: BASE_URL,
  description: "Pratite stanje artikala, primajte robu, analizirajte kretanje zaliha i izvozite izveštaje za vašu radnju.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
  },
  featureList: [
    "Upravljanje artiklima sa varijantama",
    "Prijem robe i skeniranje barkoda",
    "Analitika i grafikon aktivnosti",
    "Audit dnevnik promena stanja",
    "Uvoz iz CSV, XLS i XLSX",
    "Izvoz u Excel i PDF",
    "Timski rad sa ulogama",
  ],
  inLanguage: ["sr", "en", "ru"],
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        id="json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
