"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-context";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import LoginAskAi from "@/components/LoginAskAi";
import {
  Package, TrendingUp, BarChart2, ClipboardList,
  ScanBarcode, Layers, Users, ArrowRight, X, FileSpreadsheet,
  ShoppingBag, Store,
} from "lucide-react";

type Mode = "login" | "newShop" | "joinShop";

const FEATURE_KEYS = [
  { icon: Package,      key: "products",  color: "rgba(99,102,241,0.12)", iconColor: "#6366f1" },
  { icon: TrendingUp,   key: "receive",   color: "rgba(34,197,94,0.1)",   iconColor: "#22c55e" },
  { icon: ShoppingBag,  key: "sales",     color: "rgba(236,72,153,0.1)",  iconColor: "#ec4899" },
  { icon: Store,        key: "catalog",   color: "rgba(34,211,238,0.1)",  iconColor: "#22d3ee" },
  { icon: BarChart2,    key: "analytics", color: "rgba(168,85,247,0.1)",  iconColor: "#a855f7" },
  { icon: Users,        key: "team",      color: "rgba(34,197,94,0.1)",   iconColor: "#22c55e" },
  { icon: ClipboardList,key: "audit",     color: "rgba(245,158,11,0.1)",  iconColor: "#f59e0b" },
  { icon: FileSpreadsheet, key: "importExport", color: "rgba(34,211,238,0.1)", iconColor: "#22d3ee" },
  { icon: ScanBarcode,  key: "scan",      color: "rgba(239,68,68,0.1)",   iconColor: "#ef4444" },
  { icon: Layers,       key: "variants",  color: "rgba(168,85,247,0.1)",  iconColor: "#a855f7" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [shopName, setShopName] = useState("");
  const [shopId, setShopId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeModal(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  function openModal(m: Mode = "login") {
    setMode(m);
    setError("");
    setShopName("");
    setShopId("");
    setOpen(true);
  }

  function closeModal() {
    if (loading) return;
    setOpen(false);
    setError("");
  }

  async function handleGoogleSignIn() {
    setError("");
    if (mode === "newShop" && !shopName.trim()) { setError(t("auth.googleShopNameRequired")); return; }
    if (mode === "joinShop" && !shopId.trim()) { setError(t("auth.googleShopIdRequired")); return; }
    setLoading(true);
    try {
      await signInWithGoogle(mode, shopName, shopId);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "";
      const message = err instanceof Error ? err.message : "";
      if (message === "GOOGLE_PROFILE_REQUIRED") { setMode("newShop"); setLoading(false); return; }
      const errorKey =
        message === "GOOGLE_SHOP_NAME_REQUIRED" ? "auth.googleShopNameRequired"
        : message === "GOOGLE_SHOP_ID_REQUIRED" ? "auth.googleShopIdRequired"
        : message === "GOOGLE_SHOP_NOT_FOUND" ? "auth.googleShopNotFound"
        : code === "auth/popup-closed-by-user" ? "auth.googlePopupClosed"
        : code === "auth/popup-blocked" ? "auth.googlePopupBlocked"
        : code === "auth/operation-not-allowed" ? "auth.googleProviderDisabled"
        : code === "auth/account-exists-with-different-credential" ? "auth.googleAccountConflict"
        : "auth.googleError";
      setError(t(errorKey));
    } finally {
      setLoading(false);
    }
  }

  const modeDesc: Record<Mode, string> = {
    login:    t("login.modeDesc.login"),
    newShop:  t("login.modeDesc.newShop"),
    joinShop: t("login.modeDesc.joinShop"),
  };

  const TABS: { id: Mode; label: string }[] = [
    { id: "login", label: t("auth.login") },
    { id: "newShop", label: t("auth.newShop") },
    { id: "joinShop", label: t("auth.joinShop") },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

      {/* Orbs */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", maxWidth: 800, maxHeight: 800, background: "radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 65%)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-8%", width: "55vw", height: "55vw", maxWidth: 700, maxHeight: 700, background: "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 65%)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: "45%", left: "40%", width: "40vw", height: "40vw", maxWidth: 500, maxHeight: 500, background: "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 65%)", borderRadius: "50%" }} />
      </div>

      {/* Navbar */}
      <nav style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", background: "color-mix(in srgb, var(--bg-2) 72%, transparent)", gap: 8 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #6366f1, #a855f7)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 4px 14px rgba(99,102,241,0.45)", flexShrink: 0 }}>📦</div>
          <span className="nav-brand" style={{ fontSize: "0.92rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{t("brand")}</span>
        </div>
        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LanguageSwitcher />
          <ThemeSwitcher />
          <button
            onClick={() => openModal("login")}
            className="nav-login-btn"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.42rem 0.9rem", background: "linear-gradient(135deg, #6366f1, #4f52d9)", color: "white", border: "none", borderRadius: 9, fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 12px rgba(99,102,241,0.4)", transition: "all 0.18s", whiteSpace: "nowrap" }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(99,102,241,0.6)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 12px rgba(99,102,241,0.4)"; (e.currentTarget as HTMLButtonElement).style.transform = "none"; }}
            aria-label={t("auth.login")}
          >
            <span className="nav-login-label">{t("auth.login")}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "4rem 1.5rem 3rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 99, padding: "0.28rem 0.85rem", marginBottom: "1.25rem" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", display: "inline-block", boxShadow: "0 0 8px #6366f1" }} />
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{t("login.badge")}</span>
        </div>
        <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)", fontWeight: 900, color: "var(--text-1)", margin: "0 auto 1.1rem", lineHeight: 1.08, letterSpacing: "-0.04em", maxWidth: 720 }}>
          {t("login.heroTitle")}{" "}
          <span style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            {t("login.heroTitleAccent")}
          </span>
        </h1>
        <p style={{ fontSize: "1.05rem", color: "var(--text-2)", maxWidth: 520, margin: "0 auto 2rem", lineHeight: 1.65 }}>
          {t("login.heroSubtitle")}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => openModal("newShop")}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", padding: "0.7rem 1.5rem" }}
          >
            {t("login.ctaNew")} <ArrowRight size={15} />
          </button>
          <button
            onClick={() => openModal("login")}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "0.7rem 1.5rem", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: "0.9rem", fontWeight: 600, color: "var(--text-1)", cursor: "pointer", transition: "all 0.18s" }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(99,102,241,0.4)"; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            {t("login.ctaExisting")}
          </button>
        </div>
      </section>

      {/* Feature grid — full width */}
      <section style={{ position: "relative", zIndex: 1, padding: "0 1.5rem 5rem", maxWidth: 1200, marginInline: "auto", width: "100%" }}>
        <div className="login-features" style={{ display: "grid", gap: "1rem" }}>
          {FEATURE_KEYS.map(({ icon: Icon, key, color, iconColor }) => (
            <div
              key={key}
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.1rem 1.2rem", cursor: "default", transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s" }}
              onMouseOver={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = iconColor + "55"; el.style.transform = "translateY(-3px)"; el.style.boxShadow = `0 8px 28px ${iconColor}18`; }}
              onMouseOut={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = "var(--border)"; el.style.transform = "none"; el.style.boxShadow = "none"; }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.7rem" }}>
                <Icon size={16} color={iconColor} strokeWidth={2.2} />
              </div>
              <p style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--text-1)", margin: "0 0 0.35rem", lineHeight: 1.3 }}>{t(`feature.${key}.title`)}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: 0, lineHeight: 1.55 }}>{t(`feature.${key}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      <LoginAskAi />

      {/* Modal backdrop */}
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "fadeIn 0.15s ease" }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            style={{ width: "100%", maxWidth: 400, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "1.75rem", boxShadow: "0 24px 80px rgba(0,0,0,0.5)", position: "relative", animation: "slideUp 0.2s ease" }}
          >
            {/* Close */}
            <button
              onClick={closeModal}
              aria-label="Zatvori"
              style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)", transition: "all 0.15s" }}
              onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)"; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)"; }}
            >
              <X size={14} />
            </button>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: "1.5rem" }}>
              <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #6366f1, #a855f7)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}>📦</div>
              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{t("brand")}</span>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, background: "var(--bg-3)", borderRadius: 11, padding: 3, marginBottom: "1.25rem", border: "1px solid var(--border)" }}>
              {TABS.map((tab) => (
                <button key={tab.id} onClick={() => { setMode(tab.id); setError(""); }} style={{
                  flex: 1, padding: "0.48rem 0",
                  fontSize: "0.75rem", fontWeight: 600,
                  borderRadius: 9, border: "none", cursor: "pointer",
                  transition: "all 0.18s",
                  background: mode === tab.id ? "linear-gradient(135deg, #6366f1, #4f52d9)" : "transparent",
                  color: mode === tab.id ? "white" : "var(--text-2)",
                  boxShadow: mode === tab.id ? "0 2px 8px rgba(99,102,241,0.4)" : "none",
                }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mode description */}
            <p style={{ fontSize: "0.78rem", color: "var(--text-3)", margin: "0 0 1.25rem", lineHeight: 1.6, minHeight: "2.6rem" }}>
              {modeDesc[mode]}
            </p>

            {/* Error */}
            {error && (
              <div role="alert" style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "0.65rem 0.9rem", fontSize: "0.8rem", color: "var(--red)", marginBottom: "1rem", lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            {/* Inputs */}
            {mode === "newShop" && (
              <div style={{ marginBottom: "0.875rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("auth.shopName")}
                </label>
                <input className="input" type="text" placeholder={t("auth.shopName")} value={shopName} onChange={(e) => setShopName(e.target.value)} autoFocus />
              </div>
            )}
            {mode === "joinShop" && (
              <div style={{ marginBottom: "0.875rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("auth.shopId")}
                </label>
                <input className="input" type="text" placeholder="Shop ID" value={shopId} onChange={(e) => setShopId(e.target.value)} autoFocus />
              </div>
            )}

            {/* Google button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{ width: "100%", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "0.75rem 1.25rem", border: "1px solid var(--border-hover)", borderRadius: 11, background: "var(--bg-3)", color: "var(--text-1)", fontSize: "0.875rem", fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.65 : 1, transition: "all 0.2s" }}
              onMouseOver={(e) => { if (!loading) { const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--bg)"; b.style.borderColor = "rgba(99,102,241,0.45)"; b.style.boxShadow = "0 0 24px rgba(99,102,241,0.14)"; } }}
              onMouseOut={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--bg-3)"; b.style.borderColor = "var(--border-hover)"; b.style.boxShadow = "none"; }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              <span style={{ flex: 1, textAlign: "center" }}>{loading ? t("loading") : t("auth.googleBtn")}</span>
              {!loading && <ArrowRight size={15} style={{ opacity: 0.4, flexShrink: 0 }} />}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.7rem", color: "var(--text-3)", marginTop: "1.1rem" }}>
              {t("brand")} · {new Date().getFullYear()}
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ position: "relative", zIndex: 1, borderTop: "1px solid var(--border)", padding: "1.5rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", flex: 1 }}>
          <div style={{ width: 22, height: 22, background: "linear-gradient(135deg, #6366f1, #a855f7)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>📦</div>
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-3)" }}>{t("brand")}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--border)" }}>·</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{new Date().getFullYear()}</span>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.97) } to { opacity: 1; transform: none } }
        .login-features { grid-template-columns: 1fr; }
        @media (min-width: 640px) { .login-features { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1280px) { .login-features { grid-template-columns: repeat(5, 1fr); } }
        @media (max-width: 480px) {
          .nav-brand { display: none; }
          .nav-login-label { display: none; }
          .nav-login-btn { padding: 0.42rem 0.6rem !important; }
        }
      `}</style>
    </div>
  );
}
