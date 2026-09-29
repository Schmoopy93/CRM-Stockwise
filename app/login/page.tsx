"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-context";
import { Package, TrendingUp, BarChart2, ShieldCheck } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type Mode = "login" | "newShop" | "joinShop";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [shopName, setShopName] = useState("");
  const [shopId, setShopId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError("");
    if (mode === "newShop" && !shopName.trim()) {
      setError(t("auth.googleShopNameRequired"));
      return;
    }
    if (mode === "joinShop" && !shopId.trim()) {
      setError(t("auth.googleShopIdRequired"));
      return;
    }
    setLoading(true);
    try {
      await signInWithGoogle(mode, shopName, shopId);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "";
      const message = err instanceof Error ? err.message : "";
      const errorKey = message === "GOOGLE_PROFILE_REQUIRED"
        ? "auth.googleProfileRequired"
        : message === "GOOGLE_SHOP_NAME_REQUIRED"
          ? "auth.googleShopNameRequired"
          : message === "GOOGLE_SHOP_ID_REQUIRED"
            ? "auth.googleShopIdRequired"
            : message === "GOOGLE_SHOP_NOT_FOUND"
              ? "auth.googleShopNotFound"
              : code === "auth/popup-closed-by-user"
                ? "auth.googlePopupClosed"
                : code === "auth/popup-blocked"
                  ? "auth.googlePopupBlocked"
                  : code === "auth/operation-not-allowed"
                    ? "auth.googleProviderDisabled"
                    : code === "auth/account-exists-with-different-credential"
                      ? "auth.googleAccountConflict"
                      : "auth.googleError";
      setError(t(errorKey));
    } finally {
      setLoading(false);
    }
  }

  const TABS: { id: Mode; label: string }[] = [
    { id: "login", label: t("auth.login") },
    { id: "newShop", label: t("auth.newShop") },
    { id: "joinShop", label: t("auth.joinShop") },
  ];

  const FEATURES = [
    { icon: Package, text: t("dashboard.totalProducts") },
    { icon: TrendingUp, text: t("analytics.received") },
    { icon: BarChart2, text: t("analytics.title") },
    { icon: ShieldCheck, text: t("audit.title") },
  ];

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      background: "var(--bg)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background orbs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: "-20%", left: "-10%",
          width: "60vw", height: "60vw", maxWidth: 700, maxHeight: 700,
          background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute", bottom: "-15%", right: "-10%",
          width: "50vw", height: "50vw", maxWidth: 600, maxHeight: 600,
          background: "radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute", top: "40%", right: "20%",
          width: "30vw", height: "30vw", maxWidth: 400, maxHeight: 400,
          background: "radial-gradient(circle, rgba(34,211,238,0.07) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
      </div>

      {/* Left panel — visible on wide screens */}
      <div className="login-left-panel" style={{
        flex: "0 0 420px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "3rem 3.5rem",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "3rem" }}>
          <div style={{
            width: 48, height: 48,
            background: "linear-gradient(135deg, var(--accent), #a855f7)",
            borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24,
            boxShadow: "0 8px 32px rgba(99,102,241,0.4)",
          }}>📦</div>
          <div>
            <p style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-1)", margin: 0, letterSpacing: "-0.02em" }}>
              {t("brand")}
            </p>
          </div>
        </div>

        <h1 style={{
          fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
          fontWeight: 800,
          color: "var(--text-1)",
          margin: "0 0 1rem",
          lineHeight: 1.15,
          letterSpacing: "-0.03em",
        }}>
          {t("tagline")}
        </h1>

        <p style={{ fontSize: "0.95rem", color: "var(--text-2)", margin: "0 0 2.5rem", lineHeight: 1.6 }}>
          {t("dashboard.subtitle")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {FEATURES.map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: "var(--accent-glow)",
                border: "1px solid rgba(99,102,241,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={15} color="var(--accent-2)" />
              </div>
              <span style={{ fontSize: "0.875rem", color: "var(--text-2)", fontWeight: 500 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="login-divider" style={{
        width: 1,
        background: "linear-gradient(to bottom, transparent, var(--border) 20%, var(--border) 80%, transparent)",
        alignSelf: "stretch",
        flexShrink: 0,
      }} />

      {/* Right panel — login form */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        position: "relative",
        zIndex: 1,
      }}>
        <div className="login-card fade-up" style={{
          width: "100%",
          maxWidth: 400,
        }}>
          {/* Mobile logo */}
          <div className="login-mobile-logo" style={{
            display: "none",
            alignItems: "center",
            gap: 10,
            marginBottom: "1.75rem",
          }}>
            <div style={{
              width: 40, height: 40,
              background: "linear-gradient(135deg, var(--accent), #a855f7)",
              borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
              boxShadow: "0 6px 20px rgba(99,102,241,0.35)",
            }}>📦</div>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
              {t("brand")}
            </span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: "1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-1)", margin: 0, letterSpacing: "-0.02em" }}>
                {mode === "login" ? t("auth.login") : mode === "newShop" ? t("auth.newShop") : t("auth.joinShop")}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <LanguageSwitcher />
                <ThemeSwitcher />
              </div>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-3)", margin: 0 }}>
              {mode === "login"
                ? t("tagline")
                : mode === "newShop"
                  ? t("auth.shopName")
                  : t("auth.shopId")}
            </p>
          </div>

          {/* Mode tabs */}
          <div style={{
            display: "flex", gap: 2,
            background: "var(--bg-3)",
            borderRadius: 11, padding: 3,
            marginBottom: "1.5rem",
            border: "1px solid var(--border)",
          }}>
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => { setMode(tab.id); setError(""); }} style={{
                flex: 1, padding: "0.5rem 0",
                fontSize: "0.78rem", fontWeight: 600,
                borderRadius: 9, border: "none", cursor: "pointer",
                transition: "all 0.18s",
                background: mode === tab.id
                  ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                  : "transparent",
                color: mode === tab.id ? "white" : "var(--text-2)",
                boxShadow: mode === tab.id ? "0 2px 8px rgba(99,102,241,0.4)" : "none",
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div role="alert" style={{
              background: "var(--red-dim)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 10,
              padding: "0.7rem 1rem",
              fontSize: "0.82rem",
              color: "var(--red)",
              marginBottom: "1rem",
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Inputs */}
          {mode === "newShop" && (
            <div style={{ marginBottom: "0.875rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("auth.shopName")}
              </label>
              <input
                className="input"
                type="text"
                placeholder={t("auth.shopName")}
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}
          {mode === "joinShop" && (
            <div style={{ marginBottom: "0.875rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("auth.shopId")}
              </label>
              <input
                className="input"
                type="text"
                placeholder={t("auth.shopId")}
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: "100%",
              minHeight: 48,
              marginTop: mode === "login" ? 0 : "0.25rem",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "0.75rem 1rem",
              border: "1px solid var(--border-hover)",
              borderRadius: 11,
              background: "var(--bg-3)",
              color: "var(--text-1)",
              fontSize: "0.875rem", fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.65 : 1,
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseOver={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(99,102,241,0.4)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 20px rgba(99,102,241,0.15)";
              }
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
            }}
          >
            {/* Google G */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            {loading ? t("loading") : t("auth.googleBtn")}
          </button>

          {/* Footer note */}
          <p style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--text-3)", marginTop: "1.25rem", lineHeight: 1.5 }}>
            {t("brand")} · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
