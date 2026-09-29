"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useI18n, Locale } from "@/lib/i18n-context";
import { ChevronDown } from "lucide-react";

const LOCALES: { code: Locale; country: string; label: string }[] = [
  { code: "sr", country: "rs", label: "Srpski" },
  { code: "en", country: "gb", label: "English" },
  { code: "ru", country: "ru", label: "Русский" },
];

function Flag({ country, label }: { country: string; label: string }) {
  return (
    <Image
      src={`https://flagcdn.com/w40/${country}.png`}
      alt={label}
      width={22}
      height={15}
      style={{ borderRadius: 2, display: "block" }}
      unoptimized
    />
  );
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const current = LOCALES.find((l) => l.code === locale)!;

  if (!isMobile) {
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
              background: locale === code ? "var(--accent-glow)" : "var(--bg-3)",
              border: `1px solid ${locale === code ? "rgba(99,102,241,0.35)" : "var(--border)"}`,
              borderRadius: 9, cursor: "pointer", transition: "all 0.15s",
              opacity: locale === code ? 1 : 0.55,
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = locale === code ? "1" : "0.55"; }}
          >
            <Flag country={country} label={label} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          height: 34, padding: "0 8px",
          background: open ? "var(--accent-glow)" : "var(--bg-3)",
          border: `1px solid ${open ? "rgba(99,102,241,0.35)" : "var(--border)"}`,
          borderRadius: 9, cursor: "pointer", transition: "all 0.15s",
        }}
      >
        <Flag country={current.country} label={current.label} />
        <ChevronDown size={12} color="var(--text-3)" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "var(--bg-2)", border: "1px solid var(--border)",
            borderRadius: 12, overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            minWidth: 130, zIndex: 100,
            animation: "slideUp 0.15s ease",
          }}
        >
          {LOCALES.map(({ code, country, label }) => (
            <button
              key={code}
              role="option"
              aria-selected={locale === code}
              onClick={() => { setLocale(code); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 9,
                padding: "0.6rem 0.9rem",
                background: locale === code ? "var(--accent-glow)" : "transparent",
                border: "none", cursor: "pointer",
                fontSize: "0.82rem", fontWeight: locale === code ? 700 : 400,
                color: locale === code ? "var(--accent)" : "var(--text-1)",
                transition: "background 0.12s",
              }}
              onMouseOver={(e) => { if (locale !== code) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}
              onMouseOut={(e) => { if (locale !== code) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <Flag country={country} label={label} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
