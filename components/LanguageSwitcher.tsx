"use client";

import Image from "next/image";
import { useI18n, Locale } from "@/lib/i18n-context";

const LOCALES: { code: Locale; country: string; label: string }[] = [
  { code: "sr", country: "rs", label: "Srpski" },
  { code: "en", country: "gb", label: "English" },
  { code: "ru", country: "ru", label: "Русский" },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {LOCALES.map(({ code, country, label }) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          title={label}
          aria-label={label}
          aria-pressed={locale === code}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34,
            fontSize: "1.4rem",
            lineHeight: 1,
            background: locale === code ? "var(--accent-glow)" : "var(--bg-3)",
            border: `1px solid ${locale === code ? "rgba(99,102,241,0.35)" : "var(--border)"}`,
            borderRadius: 9,
            cursor: "pointer",
            transition: "all 0.15s",
            opacity: locale === code ? 1 : 0.55,
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = locale === code ? "1" : "0.55"; }}
        >
          <Image
            src={`https://flagcdn.com/w40/${country}.png`}
            alt={label}
            width={24}
            height={16}
            style={{ borderRadius: 2, display: "block" }}
            unoptimized
          />
        </button>
      ))}
    </div>
  );
}
