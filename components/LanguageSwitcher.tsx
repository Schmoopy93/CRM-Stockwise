"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n, LOCALE_LABELS, Locale } from "@/lib/i18n-context";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const flag = LOCALE_LABELS[locale].split(" ")[1];
  const code = { sr: "SR", en: "EN", ru: "RU" }[locale];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0.45rem 0.75rem",
          background: open ? "var(--bg-3)" : "transparent",
          border: "1px solid var(--border)",
          borderRadius: 9,
          fontSize: "0.78rem", fontWeight: 600,
          color: "var(--text-2)",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <Globe size={13} />
        {flag} {code}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: 0,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            minWidth: 160,
            zIndex: 200,
          }}
        >
          {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([loc, label], i, arr) => (
            <button
              key={loc}
              onClick={() => { setLocale(loc); setOpen(false); }}
              style={{
                width: "100%", textAlign: "left",
                padding: "0.65rem 1rem",
                background: loc === locale ? "var(--accent-glow)" : "none",
                border: "none",
                borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                fontSize: "0.82rem",
                fontWeight: loc === locale ? 700 : 400,
                color: loc === locale ? "var(--accent-2)" : "var(--text-1)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
