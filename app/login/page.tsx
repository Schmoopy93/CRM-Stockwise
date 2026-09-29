"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, registerNewShop, registerJoinShop } from "@/lib/actions";
import { useI18n, LOCALE_LABELS, Locale } from "@/lib/i18n-context";
import { Globe } from "lucide-react";

type Mode = "login" | "newShop" | "joinShop";

export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopId, setShopId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "login") await signIn(email, password);
      else if (mode === "newShop") await registerNewShop(email, password, displayName, shopName);
      else await registerJoinShop(email, password, displayName, shopId);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally { setLoading(false); }
  }

  const TABS: { id: Mode; label: string }[] = [
    { id: "login", label: t("auth.login") },
    { id: "newShop", label: t("auth.newShop") },
    { id: "joinShop", label: t("auth.joinShop") },
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
      background: "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(99,102,241,0.15) 0%, transparent 70%), var(--bg)",
    }}>
      <div className="glass fade-up" style={{ width: "100%", maxWidth: 420, padding: "2rem" }}>
        {/* Logo + lang switcher */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.75rem" }}>
          <div>
            <div style={{
              width: 44, height: 44,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, marginBottom: "0.75rem",
              boxShadow: "0 8px 24px var(--accent-glow)",
            }}>📦</div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("brand")}</h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-2)", marginTop: 4 }}>{t("tagline")}</p>
          </div>
          {/* Inline lang picker */}
          <div style={{ display: "flex", gap: 4, flexDirection: "column", alignItems: "flex-end" }}>
            <Globe size={13} color="var(--text-3)" />
            {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([loc, label]) => (
              <button key={loc} onClick={() => setLocale(loc)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "0.75rem", fontWeight: loc === locale ? 700 : 400,
                  color: loc === locale ? "var(--accent-2)" : "var(--text-3)",
                  padding: "1px 0",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-3)", borderRadius: 10, padding: 3, marginBottom: "1.5rem" }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setMode(tab.id)}
              style={{
                flex: 1, padding: "0.45rem 0", fontSize: "0.8rem", fontWeight: 600,
                borderRadius: 8, border: "none", cursor: "pointer", transition: "all 0.18s",
                background: mode === tab.id ? "var(--bg-2)" : "transparent",
                color: mode === tab.id ? "var(--text-1)" : "var(--text-2)",
                boxShadow: mode === tab.id ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
              }}
            >{tab.label}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {mode !== "login" && (
            <input className="input" type="text" placeholder={t("auth.displayName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          )}
          <input className="input" type="email" placeholder={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} required />
          {mode === "newShop" && (
            <input className="input" type="text" placeholder={t("auth.shopName")} value={shopName} onChange={(e) => setShopName(e.target.value)} required />
          )}
          {mode === "joinShop" && (
            <input className="input" type="text" placeholder={t("auth.shopId")} value={shopId} onChange={(e) => setShopId(e.target.value)} required />
          )}
          {error && (
            <div style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "0.65rem 1rem", fontSize: "0.82rem", color: "var(--red)" }}>
              {error}
            </div>
          )}
          <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: "0.25rem", width: "100%", padding: "0.75rem" }}>
            {loading ? t("loading") : mode === "login" ? t("auth.loginBtn") : mode === "newShop" ? t("auth.registerBtn") : t("auth.joinBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
