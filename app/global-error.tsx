"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import sr from "@/lib/i18n/sr.json";
import en from "@/lib/i18n/en.json";
import ru from "@/lib/i18n/ru.json";
import de from "@/lib/i18n/de.json";
import es from "@/lib/i18n/es.json";
import it from "@/lib/i18n/it.json";
import type { Locale } from "@/lib/i18n-context";
import { reportClientError } from "@/lib/client-errors";

/** Replaces the root layout when it fails, so the global stylesheet and the
 * I18n and theme providers are unavailable. The language and theme come from
 * the document, and every style is inline for that reason. */

const MESSAGES: Record<string, Record<string, string>> = { sr, en, ru, de, es, it };

const PALETTES = {
  dark: {
    bg: "#0f0f14",
    card: "#16161f",
    border: "rgba(255, 255, 255, 0.08)",
    text: "#f0f0f5",
    muted: "#8b8b9e",
    faint: "#55556a",
    accent: "#6366f1",
    amber: "#f59e0b",
    amberSoft: "rgba(245, 158, 11, 0.14)",
  },
  light: {
    bg: "#eef0f6",
    card: "#ffffff",
    border: "rgba(15, 23, 42, 0.14)",
    text: "#0b0d14",
    muted: "#3d4157",
    faint: "#6b7089",
    accent: "#4f46e5",
    amber: "#b45309",
    amberSoft: "rgba(217, 119, 6, 0.12)",
  },
} as const;

function AlertIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** The providers are gone, so the document is the only source for the chosen
 * language and theme. The values are read as an external store: the server
 * snapshot keeps hydration stable, and React re-renders once on the client. */
const noSubscribe = () => () => {};

function readLocale(): Locale {
  const lang = document.documentElement.lang.split("-")[0].toLowerCase();
  return lang in MESSAGES ? (lang as Locale) : "sr";
}

function readTheme(): "dark" | "light" {
  const stored = window.localStorage.getItem("inventory-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useSyncExternalStore<Locale>(noSubscribe, readLocale, () => "sr");
  const theme = useSyncExternalStore<"dark" | "light">(noSubscribe, readTheme, () => "dark");

  useEffect(() => {
    reportClientError(error, "global-boundary", error.digest);
  }, [error]);

  const t = (key: string) => MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  const palette = PALETTES[theme];

  return (
    <html lang={locale} style={{ colorScheme: theme, backgroundColor: palette.bg }}>
      <body style={{
        margin: 0,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2.5rem 1.25rem",
        background: palette.bg,
        color: palette.text,
        fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}>
        <title>{t("errorPage.title")}</title>
        <main style={{
          width: "min(100%, 540px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.85rem",
          padding: "2.6rem 2rem",
          border: `1px solid ${palette.border}`,
          borderRadius: "18px",
          background: palette.card,
          textAlign: "center",
        }}>
          <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: palette.faint }}>
            Logixia
          </span>
          <span style={{
            display: "grid",
            placeItems: "center",
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: palette.amberSoft,
          }}>
            <AlertIcon color={palette.amber} />
          </span>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.2, color: palette.text }}>
            {t("errorPage.title")}
          </h1>
          <p style={{ margin: 0, maxWidth: "42ch", fontSize: "0.9rem", lineHeight: 1.7, color: palette.muted }}>
            {t("errorPage.body")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.6rem", marginTop: "0.5rem" }}>
            <button type="button" onClick={() => retry()} style={{
              padding: "0.6rem 1.25rem",
              border: "none",
              borderRadius: "10px",
              background: palette.accent,
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}>
              {t("errorPage.retry")}
            </button>
            <Link href="/" style={{
              padding: "0.6rem 1.1rem",
              border: `1px solid ${palette.border}`,
              borderRadius: "10px",
              color: palette.muted,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}>
              {t("errorPage.home")}
            </Link>
          </div>
          {error.digest && (
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.7rem", color: palette.faint, overflowWrap: "anywhere" }}>
              {t("errorPage.reference")} <code style={{ color: palette.muted }}>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
