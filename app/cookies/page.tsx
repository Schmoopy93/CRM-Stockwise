"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { ArrowLeft } from "lucide-react";

const ITEMS = [
  { name: "inventory-locale", typeKey: "cookies.typeCookie", purposeKey: "cookies.purposeLocale", durationKey: "cookies.durationYear" },
  { name: "inventory-locale, inventory-theme", typeKey: "cookies.typeStorage", purposeKey: "cookies.purposePreferences", durationKey: "cookies.durationPersistent" },
  { name: "inventory-cookie-notice", typeKey: "cookies.typeStorage", purposeKey: "cookies.purposeNotice", durationKey: "cookies.durationPersistent" },
  { name: "Firebase Authentication", typeKey: "cookies.typeIndexedDb", purposeKey: "cookies.purposeAuth", durationKey: "cookies.durationSession" },
];

const sectionTitle = { fontSize: "0.95rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 0.6rem" } as const;
const paragraph = { fontSize: "0.86rem", lineHeight: 1.7, color: "var(--text-2)", margin: 0 } as const;
const cell = { padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", textAlign: "left", verticalAlign: "top" } as const;

export default function CookiesPage() {
  const { t } = useI18n();

  return (
    <main className="fade-up" style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.25rem 4rem", display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.82rem", color: "var(--text-2)", textDecoration: "none", alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-1)", margin: "0 0 0.4rem", letterSpacing: "-0.02em" }}>{t("cookies.title")}</h1>
        <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: "0 0 1rem" }}>{t("cookies.updated")}</p>
        <p style={paragraph}>{t("cookies.intro")}</p>
      </header>

      <section>
        <h2 style={sectionTitle}>{t("cookies.usedTitle")}</h2>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-2)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", color: "var(--text-2)" }}>
            <thead>
              <tr style={{ color: "var(--text-3)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={cell}>{t("cookies.colName")}</th>
                <th style={cell}>{t("cookies.colType")}</th>
                <th style={cell}>{t("cookies.colPurpose")}</th>
                <th style={cell}>{t("cookies.colDuration")}</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item.name + item.typeKey}>
                  <td style={{ ...cell, fontFamily: "monospace", color: "var(--text-1)" }}>{item.name}</td>
                  <td style={cell}>{t(item.typeKey)}</td>
                  <td style={cell}>{t(item.purposeKey)}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{t(item.durationKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitle}>{t("cookies.thirdPartyTitle")}</h2>
        <p style={paragraph}>{t("cookies.thirdParty")}</p>
      </section>

      <section>
        <h2 style={sectionTitle}>{t("cookies.manageTitle")}</h2>
        <p style={paragraph}>{t("cookies.manage")}</p>
      </section>
    </main>
  );
}
