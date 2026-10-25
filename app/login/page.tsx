"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-context";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import LoginAskAi from "@/components/LoginAskAi";
import {
  Package, TrendingUp, BarChart2, ClipboardList,
  ScanBarcode, Users, UserRound, ArrowRight, X, FileSpreadsheet,
  ShoppingBag, Store, Receipt, DollarSign, Check, LogIn,
} from "lucide-react";

type Mode = "login" | "newShop" | "joinShop";

const FEATURE_KEYS = [
  { icon: Package,      key: "products",  color: "rgba(99,102,241,0.12)", iconColor: "#6366f1" },
  { icon: TrendingUp,   key: "receive",   color: "rgba(34,197,94,0.1)",   iconColor: "#22c55e" },
  { icon: ShoppingBag,  key: "sales",     color: "rgba(236,72,153,0.1)",  iconColor: "#ec4899" },
  { icon: Receipt,      key: "orders",    color: "rgba(245,158,11,0.1)",  iconColor: "#f59e0b" },
  { icon: UserRound,    key: "customers", color: "rgba(14,165,233,0.1)",  iconColor: "#0ea5e9" },
  { icon: Store,        key: "catalog",   color: "rgba(34,211,238,0.1)",  iconColor: "#22d3ee" },
  { icon: BarChart2,    key: "analytics", color: "rgba(168,85,247,0.1)",  iconColor: "#a855f7" },
  { icon: DollarSign,   key: "currency",  color: "rgba(20,184,166,0.1)",  iconColor: "#14b8a6" },
  { icon: Users,        key: "team",      color: "rgba(34,197,94,0.1)",   iconColor: "#22c55e" },
  { icon: ClipboardList,key: "audit",     color: "rgba(245,158,11,0.1)",  iconColor: "#f59e0b" },
  { icon: FileSpreadsheet, key: "importExport", color: "rgba(34,211,238,0.1)", iconColor: "#22d3ee" },
  { icon: ScanBarcode,  key: "scan",      color: "rgba(239,68,68,0.1)",   iconColor: "#ef4444" },
] as const;

const HOW_STEPS = [
  { key: "step1", icon: Store,        color: "#6366f1" },
  { key: "step2", icon: Package,      color: "#22c55e" },
  { key: "step3", icon: TrendingUp,   color: "#a855f7" },
] as const;

function subscribeToNothing() {
  return () => {};
}

function readSetupRequested() {
  return new URLSearchParams(window.location.search).get("setup") === "1";
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const setupRequested = useSyncExternalStore(subscribeToNothing, readSetupRequested, () => false);
  const [modal, setModal] = useState<{ open: boolean; mode: Mode } | null>(null);
  const { open, mode } = modal ?? (setupRequested ? { open: true, mode: "newShop" as Mode } : { open: false, mode: "login" as Mode });
  const [shopName, setShopName] = useState("");
  const [shopId, setShopId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shownError = error || (modal === null && setupRequested ? t("auth.profileRequired") : "");

  const closeModal = useCallback(() => {
    if (loading) return;
    setModal({ open: false, mode });
    setError("");
  }, [loading, mode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeModal(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, closeModal]);

  function openModal(m: Mode = "login") {
    setModal({ open: true, mode: m });
    setError("");
    setShopName("");
    setShopId("");
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
      if (message === "GOOGLE_PROFILE_REQUIRED") { setModal({ open: true, mode: "newShop" }); setError(t("auth.profileRequired")); setLoading(false); return; }
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
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column", position: "relative", overflow: "clip" }}>

      {/* Orbs */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", maxWidth: 800, maxHeight: 800, background: "radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 65%)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-8%", width: "55vw", height: "55vw", maxWidth: 700, maxHeight: 700, background: "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 65%)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: "45%", left: "40%", width: "40vw", height: "40vw", maxWidth: 500, maxHeight: 500, background: "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 65%)", borderRadius: "50%" }} />
      </div>

      {/* Navbar */}
      <nav className="login-navbar" style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", background: "color-mix(in srgb, var(--bg-2) 72%, transparent)", gap: 8 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, overflow: "hidden", boxShadow: "0 4px 14px rgba(99,102,241,0.45)", flexShrink: 0 }}><Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
          <span className="nav-brand brand-wordmark brand-wordmark-nav">{t("brand")}</span>
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
      <section className="login-hero">
        <div className="login-hero-inner">
          <div className="login-hero-copy">
            <div className="login-brand-row">
              <span className="login-brand-icon">
                <Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </span>
              <span className="brand-wordmark brand-wordmark-hero">{t("brand")}</span>
              <span className="login-hero-badge">
                <span className="login-hero-badge-dot" />
                <span className="login-hero-badge-text">{t("login.badge")}</span>
              </span>
            </div>
            <h1 className="login-hero-title">
              {t("login.heroTitle")}{" "}
              <span className="login-hero-accent">{t("login.heroTitleAccent")}</span>
            </h1>
            <p className="login-hero-subtitle">{t("login.heroSubtitle")}</p>
            <div className="login-hero-actions">
              <button onClick={() => openModal("newShop")} className="btn-primary login-cta-primary">
                {t("login.ctaNew")} <ArrowRight size={15} className="login-cta-arrow" />
              </button>
              <button onClick={() => openModal("login")} className="login-cta-secondary">
                <LogIn size={15} strokeWidth={2.2} />
                {t("login.ctaExisting")}
              </button>
            </div>
            <ul className="login-trust">
              {["login.trustFree", "login.trustNoInstall", "login.trustMobile"].map((key) => (
                <li key={key}>
                  <span className="login-trust-icon"><Check size={11} strokeWidth={3} /></span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          <div className="login-hero-visual" aria-hidden="true">
            <div className="login-preview-glow" />
            <div className="login-preview">
              <div className="login-preview-head">
                <span className="login-preview-dots"><i /><i /><i /></span>
                <span className="login-preview-title">{t("nav.overview")}</span>
                <span className="login-preview-live" />
              </div>
              <div className="login-preview-stats">
                <div className="login-preview-stat">
                  <span className="login-preview-label">{t("login.preview.revenue")}</span>
                  <strong className="login-preview-value">128.450 <small>RSD</small></strong>
                  <span className="login-preview-trend"><TrendingUp size={11} strokeWidth={2.6} /> +12,4%</span>
                </div>
                <div className="login-preview-stat">
                  <span className="login-preview-label">{t("sales.title")}</span>
                  <strong className="login-preview-value">34</strong>
                </div>
                <div className="login-preview-stat">
                  <span className="login-preview-label">{t("login.preview.items")}</span>
                  <strong className="login-preview-value">128</strong>
                </div>
              </div>
              <div className="login-preview-chart">
                {[46, 62, 38, 76, 54, 90, 68].map((height) => (
                  <span key={height} className="login-preview-bar" style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
            <div className="login-preview-toast">
              <span className="login-preview-toast-icon"><ShoppingBag size={15} /></span>
              <div className="login-preview-toast-copy">
                <span className="login-preview-toast-title">{t("sales.newSale")}</span>
                <span className="login-preview-toast-meta">{t("sales.channel.store")}</span>
              </div>
              <span className="login-preview-toast-amount">+1.980 RSD</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="login-how" aria-labelledby="login-how-title">
        <div className="login-how-inner">
          <div className="login-how-head">
            <h2 id="login-how-title" className="login-how-title">{t("login.how.title")}</h2>
            <p className="login-how-subtitle">{t("login.how.subtitle")}</p>
          </div>
          <ol className="login-how-steps">
            {HOW_STEPS.map(({ key, icon: Icon, color }, index) => (
              <li key={key} className="login-how-step" style={{ "--how-accent": color } as CSSProperties}>
                <div className="login-how-top">
                  <span className="login-how-icon"><Icon size={17} strokeWidth={2.2} /></span>
                  <span className="login-how-num">0{index + 1}</span>
                </div>
                <h3 className="login-how-step-title">{t(`login.how.${key}.title`)}</h3>
                <p className="login-how-step-desc">{t(`login.how.${key}.desc`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Feature grid — full width */}
      <section className="login-features-section" aria-labelledby="login-features-title">
        <div className="login-features-head">
          <h2 id="login-features-title" className="login-features-title">{t("login.featuresTitle")}</h2>
          <span className="login-features-line" aria-hidden="true" />
        </div>
        <div className="login-features">
          {FEATURE_KEYS.map(({ icon: Icon, key, color, iconColor }) => (
            <article key={key} className="login-feature-card" style={{ "--feature-accent": iconColor } as CSSProperties}>
              <div className="login-feature-icon" style={{ background: color }}>
                <Icon size={16} color={iconColor} strokeWidth={2.2} />
              </div>
              <h3 className="login-feature-title">{t(`feature.${key}.title`)}</h3>
              <p className="login-feature-desc">{t(`feature.${key}.desc`)}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="login-final-cta" aria-labelledby="login-final-title">
        <div className="login-final-inner">
          <h2 id="login-final-title" className="login-final-title">{t("login.finalCta.title")}</h2>
          <p className="login-final-subtitle">{t("login.finalCta.subtitle")}</p>
          <div className="login-final-actions">
            <button onClick={() => openModal("newShop")} className="btn-primary login-cta-primary">
              {t("login.ctaNew")} <ArrowRight size={15} className="login-cta-arrow" />
            </button>
            <button onClick={() => openModal("login")} className="login-cta-secondary">
              <LogIn size={15} strokeWidth={2.2} />
              {t("login.ctaExisting")}
            </button>
          </div>
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
            style={{ width: "100%", maxWidth: 400, maxHeight: "calc(100dvh - 2rem)", overflowY: "auto", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "1.75rem", boxShadow: "0 24px 80px rgba(0,0,0,0.5)", position: "relative", animation: "slideUp 0.2s ease" }}
          >
            {/* Close */}
            <button
              onClick={closeModal}
              aria-label={t("catalog.close")}
              style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)", transition: "all 0.15s" }}
              onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)"; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)"; }}
            >
              <X size={14} />
            </button>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: "1.5rem" }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, overflow: "hidden", boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}><Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
              <span className="brand-wordmark brand-wordmark-modal">{t("brand")}</span>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, background: "var(--bg-3)", borderRadius: 11, padding: 3, marginBottom: "1.25rem", border: "1px solid var(--border)" }}>
              {TABS.map((tab) => (
                <button key={tab.id} onClick={() => { setModal({ open: true, mode: tab.id }); setError(""); }} style={{
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
            {shownError && (
              <div role="alert" style={{ background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "0.65rem 0.9rem", fontSize: "0.8rem", color: "var(--red)", marginBottom: "1rem", lineHeight: 1.5 }}>
                {shownError}
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
                <input className="input" type="text" placeholder={t("auth.shopId")} value={shopId} onChange={(e) => setShopId(e.target.value)} autoFocus />
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
              <span className="brand-wordmark brand-wordmark-footer">{t("brand")}</span> · {new Date().getFullYear()}
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="login-footer" style={{ position: "relative", zIndex: 1, borderTop: "1px solid var(--border)", padding: "1.5rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, rowGap: 6, justifyContent: "center", flexWrap: "wrap", flex: 1, minWidth: 0, textAlign: "center" }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, overflow: "hidden" }}><Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={22} height={22} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
          <span className="brand-wordmark brand-wordmark-footer">{t("brand")}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--border)" }}>·</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{new Date().getFullYear()}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--border)" }}>·</span>
          <Link href="/cookies" style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{t("cookies.title")}</Link>
          <span style={{ fontSize: "0.78rem", color: "var(--border)" }}>·</span>
          <Link href="/privacy" style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{t("legal.privacy.title")}</Link>
          <span style={{ fontSize: "0.78rem", color: "var(--border)" }}>·</span>
          <Link href="/terms" style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{t("legal.terms.title")}</Link>
        </div>
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.97) } to { opacity: 1; transform: none } }

        /* Hero */
        .login-hero {
          position: relative;
          z-index: 1;
          padding: clamp(2.5rem, 5.5vw, 4.25rem) clamp(1.15rem, 4vw, 2rem) clamp(2.5rem, 5vw, 4rem);
        }
        .login-hero-inner {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          align-items: center;
          gap: clamp(2rem, 5vw, 3.5rem);
          max-width: 1200px;
          margin-inline: auto;
        }
        @media (min-width: 1024px) {
          .login-hero-inner {
            grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
            gap: clamp(2rem, 4vw, 3.5rem);
          }
        }
        .login-hero-copy { min-width: 0; }
        .login-brand-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.6rem 0.8rem;
          margin-bottom: 1.15rem;
        }
        .login-brand-icon {
          width: 44px;
          height: 44px;
          flex: 0 0 auto;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 10px 26px var(--accent-glow);
        }
        .login-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.26rem 0.7rem;
          border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
          border-radius: 99px;
          background: var(--accent-glow);
        }
        .login-hero-badge-dot {
          width: 6px;
          height: 6px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
        }
        .login-hero-badge-text {
          font-size: 0.64rem;
          font-weight: 700;
          line-height: 1.4;
          letter-spacing: 0.055em;
          text-transform: uppercase;
          color: var(--accent);
          white-space: nowrap;
        }
        .login-hero-title {
          max-width: 680px;
          margin: 0 0 1.15rem;
          font-family: var(--font-display), "Segoe UI", sans-serif;
          font-size: clamp(1.9rem, 3.5vw, 2.8rem);
          font-weight: 650;
          line-height: 1.15;
          letter-spacing: -0.04em;
          color: var(--text-1);
          text-wrap: balance;
          overflow-wrap: break-word;
        }
        .login-hero-accent {
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .login-hero-subtitle {
          max-width: 560px;
          margin: 0 0 1.75rem;
          font-size: 1.03rem;
          line-height: 1.68;
          color: var(--text-2);
        }
        .login-hero-actions,
        .login-final-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }
        .login-cta-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          min-height: 48px;
          padding: 0.8rem 1.6rem;
          border-radius: 11px;
          font-size: 0.94rem;
          font-weight: 650;
          letter-spacing: -0.005em;
          box-shadow: 0 10px 26px var(--accent-glow);
        }
        .login-cta-arrow { transition: transform 0.2s ease; }
        .login-cta-primary:hover .login-cta-arrow { transform: translateX(3px); }
        .login-cta-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 48px;
          padding: 0.8rem 1.5rem;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 11px;
          font-size: 0.94rem;
          font-weight: 600;
          letter-spacing: -0.005em;
          color: var(--text-1);
          cursor: pointer;
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .login-cta-secondary svg { color: var(--text-3); transition: color 0.18s ease; }
        .login-cta-secondary:hover {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: var(--bg-3);
        }
        .login-cta-secondary:hover svg { color: var(--accent-2); }
        .login-cta-primary:focus-visible,
        .login-cta-secondary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
        .login-trust {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.55rem 1.25rem;
          max-width: 560px;
          margin: 1.4rem 0 0;
          padding: 0;
          list-style: none;
        }
        .login-trust li {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.78rem;
          font-weight: 500;
          line-height: 1.45;
          color: var(--text-2);
        }
        .login-trust-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--green-dim);
          color: var(--green);
        }
        @media (prefers-reduced-motion: reduce) {
          .login-cta-arrow { transition: none; }
          .login-cta-primary:hover .login-cta-arrow { transform: none; }
        }

        /* App preview */
        .login-hero-visual { display: none; position: relative; min-width: 0; }
        @media (min-width: 1024px) {
          .login-hero-visual { display: block; padding: 1rem 0.9rem 1.7rem 0; }
        }
        .login-preview-glow {
          position: absolute;
          inset: -12% -6% -8%;
          background: radial-gradient(circle at 48% 45%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 66%);
          filter: blur(16px);
          pointer-events: none;
        }
        .login-preview {
          position: relative;
          padding: 1rem 1rem 1.15rem;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 20px;
          box-shadow: 0 30px 70px -42px color-mix(in srgb, var(--accent) 75%, transparent), inset 0 1px 0 color-mix(in srgb, var(--text-1) 5%, transparent);
        }
        .login-preview-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 0.85rem;
        }
        .login-preview-dots { display: flex; gap: 4px; }
        .login-preview-dots i {
          display: block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--border-hover);
        }
        .login-preview-dots i:first-child { background: color-mix(in srgb, var(--accent) 55%, var(--border-hover)); }
        .login-preview-title {
          font-size: 0.74rem;
          font-weight: 650;
          letter-spacing: -0.005em;
          color: var(--text-2);
        }
        .login-preview-live {
          width: 7px;
          height: 7px;
          margin-left: auto;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 18%, transparent);
        }
        .login-preview-stats {
          display: grid;
          grid-template-columns: 1.35fr 0.85fr 0.85fr;
          gap: 0.5rem;
          margin-bottom: 0.6rem;
        }
        .login-preview-stat {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          padding: 0.62rem 0.68rem;
          background: var(--bg-3);
          border: 1px solid var(--border);
          border-radius: 12px;
        }
        .login-preview-stat:first-child {
          background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 11%, var(--bg-3)), var(--bg-3));
          border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
        }
        .login-preview-label {
          overflow: hidden;
          font-size: 0.62rem;
          font-weight: 650;
          letter-spacing: 0.065em;
          text-transform: uppercase;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-3);
        }
        .login-preview-value {
          font-size: 1rem;
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
          color: var(--text-1);
          white-space: nowrap;
        }
        .login-preview-stat:first-child .login-preview-value { font-size: 1.12rem; }
        .login-preview-value small {
          font-size: 0.58rem;
          font-weight: 600;
          letter-spacing: 0;
          color: var(--text-3);
        }
        .login-preview-trend {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 0.62rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--green);
        }
        .login-preview-chart {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          height: 104px;
          padding: 0.6rem 0.6rem 0;
          background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, var(--bg-2)), var(--bg-3));
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .login-preview-bar {
          flex: 1;
          min-width: 0;
          border-radius: 4px 4px 2px 2px;
          background: color-mix(in srgb, var(--accent) 42%, transparent);
          opacity: 0.7;
        }
        .login-preview-bar:last-child {
          background: linear-gradient(180deg, var(--accent-2), var(--accent));
          opacity: 1;
        }
        .login-preview-toast {
          position: absolute;
          left: -0.9rem;
          bottom: 0.15rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          width: min(320px, 94%);
          padding: 0.65rem 0.75rem;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 14px;
          box-shadow: 0 20px 45px -26px color-mix(in srgb, var(--accent) 80%, transparent);
        }
        .login-preview-toast-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          border-radius: 9px;
          background: var(--accent-glow);
          color: var(--accent-2);
        }
        .login-preview-toast-copy {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-width: 0;
          gap: 1px;
        }
        .login-preview-toast-title {
          font-size: 0.74rem;
          font-weight: 650;
          color: var(--text-1);
          white-space: nowrap;
        }
        .login-preview-toast-meta { font-size: 0.65rem; color: var(--text-3); }
        .login-preview-toast-amount {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          font-variant-numeric: tabular-nums;
          color: var(--green);
          white-space: nowrap;
        }

        /* Hero entrance motion */
        @keyframes loginRise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes loginPreviewRise {
          from { opacity: 0; transform: translateY(26px) scale(0.985); }
          to { opacity: 1; transform: none; }
        }
        @keyframes loginBarGrow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes loginLivePulse {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 42%, transparent); opacity: 1; }
          70%, 100% { box-shadow: 0 0 0 7px transparent; opacity: 0; }
        }
        .login-preview-live { position: relative; }
        .login-preview-live::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          pointer-events: none;
        }
        @media screen and (prefers-reduced-motion: no-preference) {
          .login-brand-row,
          .login-hero-title,
          .login-hero-subtitle,
          .login-hero-actions,
          .login-trust {
            animation: loginRise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .login-brand-row { animation-delay: 0.02s; }
          .login-hero-title { animation-delay: 0.08s; }
          .login-hero-subtitle { animation-delay: 0.14s; }
          .login-hero-actions { animation-delay: 0.2s; }
          .login-trust { animation-delay: 0.26s; }
          .login-hero-visual { animation: loginPreviewRise 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.18s both; }
          .login-preview-bar {
            transform-origin: bottom;
            animation: loginBarGrow 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .login-preview-bar:nth-child(1) { animation-delay: 0.5s; }
          .login-preview-bar:nth-child(2) { animation-delay: 0.54s; }
          .login-preview-bar:nth-child(3) { animation-delay: 0.58s; }
          .login-preview-bar:nth-child(4) { animation-delay: 0.62s; }
          .login-preview-bar:nth-child(5) { animation-delay: 0.66s; }
          .login-preview-bar:nth-child(6) { animation-delay: 0.7s; }
          .login-preview-bar:nth-child(7) { animation-delay: 0.74s; }
          .login-preview-toast { animation: loginRise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.6s both; }
          .login-preview-live::after { animation: loginLivePulse 2.4s ease-out 1.4s infinite; }
        }

        /* How it works */
        .login-how {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1200px;
          margin-inline: auto;
          padding: 0 clamp(1.15rem, 4vw, 2rem) clamp(2.5rem, 5vw, 3.5rem);
        }
        .login-how-inner {
          position: relative;
          padding: clamp(1.5rem, 3.5vw, 2.4rem);
          background: linear-gradient(155deg, color-mix(in srgb, var(--accent) 7%, var(--bg-2)), var(--bg-2) 52%, color-mix(in srgb, var(--accent-2) 5%, var(--bg-2)));
          border: 1px solid var(--border);
          border-radius: 22px;
          overflow: hidden;
        }
        .login-how-inner::before {
          content: "";
          position: absolute;
          top: -55%;
          right: -12%;
          width: 420px;
          height: 420px;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 14%, transparent), transparent 68%);
          pointer-events: none;
        }
        .login-how-head {
          position: relative;
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.4rem 1.75rem;
          margin-bottom: clamp(1.25rem, 3vw, 1.8rem);
        }
        .login-how-title {
          margin: 0;
          font-family: var(--font-display), "Segoe UI", sans-serif;
          font-size: clamp(1.05rem, 2vw, 1.3rem);
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -0.025em;
          color: var(--text-1);
        }
        .login-how-subtitle {
          max-width: 48ch;
          margin: 0;
          font-size: 0.88rem;
          line-height: 1.62;
          color: var(--text-2);
        }
        .login-how-steps {
          position: relative;
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(0.7rem, 1.6vw, 0.9rem);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        @media (min-width: 768px) {
          .login-how-steps { grid-template-columns: repeat(3, 1fr); }
        }
        .login-how-step {
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 1.15rem 1.2rem 1.25rem;
          background: color-mix(in srgb, var(--bg-2) 82%, transparent);
          border: 1px solid var(--border);
          border-radius: 16px;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .login-how-step:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--how-accent) 35%, var(--border));
        }
        .login-how-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .login-how-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border-radius: 10px;
          background: color-mix(in srgb, var(--how-accent) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--how-accent) 24%, transparent);
          color: var(--how-accent);
        }
        .login-how-num {
          font-family: var(--font-display), "Segoe UI", sans-serif;
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          font-variant-numeric: tabular-nums;
          color: var(--text-3);
        }
        .login-how-step-title {
          margin: 0 0 0.32rem;
          font-size: 0.95rem;
          font-weight: 650;
          line-height: 1.32;
          letter-spacing: -0.01em;
          color: var(--text-1);
        }
        .login-how-step-desc {
          margin: 0;
          font-size: 0.82rem;
          line-height: 1.6;
          color: var(--text-2);
        }
        @media (hover: none) {
          .login-how-step:hover { transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-how-step { transition: none; }
        }

        /* Final CTA */
        .login-final-cta {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1200px;
          margin-inline: auto;
          padding: 0 clamp(1.15rem, 4vw, 2rem) clamp(3rem, 6vw, 4.5rem);
        }
        .login-final-inner {
          position: relative;
          padding: clamp(2rem, 4.5vw, 3.1rem) clamp(1.25rem, 4vw, 2.5rem);
          text-align: center;
          background:
            radial-gradient(ellipse at 50% -30%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 62%),
            linear-gradient(165deg, color-mix(in srgb, var(--accent) 9%, var(--bg-2)), var(--bg-2) 60%, color-mix(in srgb, var(--accent-2) 7%, var(--bg-2)));
          border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 34px 90px -70px color-mix(in srgb, var(--accent) 90%, transparent);
        }
        .login-final-inner::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 1px;
          background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 70%, transparent), transparent);
        }
        .login-final-title {
          max-width: 660px;
          margin: 0 auto 0.6rem;
          font-family: var(--font-display), "Segoe UI", sans-serif;
          font-size: clamp(1.3rem, 2.5vw, 1.75rem);
          font-weight: 600;
          line-height: 1.22;
          letter-spacing: -0.03em;
          color: var(--text-1);
          text-wrap: balance;
        }
        .login-final-subtitle {
          max-width: 520px;
          margin: 0 auto;
          font-size: 0.92rem;
          line-height: 1.62;
          color: var(--text-2);
          text-wrap: balance;
        }
        .login-final-actions {
          justify-content: center;
          margin-top: clamp(1.25rem, 2.5vw, 1.75rem);
        }

        /* Feature grid */
        .login-features-section {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1200px;
          margin-inline: auto;
          padding: 0 clamp(1.25rem, 4vw, 2rem) clamp(2.25rem, 4.5vw, 3.25rem);
        }
        .login-features-head {
          display: flex;
          align-items: center;
          gap: 0.9rem;
          margin: 0 0 clamp(1.15rem, 2.5vw, 1.5rem);
        }
        .login-features-title {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin: 0;
          font-family: var(--font-display), "Segoe UI", sans-serif;
          font-size: 0.85rem;
          font-weight: 550;
          line-height: 1.35;
          letter-spacing: -0.005em;
          color: var(--text-1);
        }
        .login-features-title::before {
          content: "";
          width: 7px;
          height: 7px;
          flex-shrink: 0;
          border-radius: 2px;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          box-shadow: 0 0 10px var(--accent-glow);
        }
        .login-features-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, var(--border), transparent);
        }
        .login-features {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(0.8rem, 1.8vw, 1.1rem);
        }
        @media (min-width: 640px) { .login-features { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1024px) { .login-features { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1280px) { .login-features { grid-template-columns: repeat(4, 1fr); } }
        .login-feature-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          height: 100%;
          padding: 1.15rem 1.2rem 1.2rem;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .login-feature-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 2px;
          background: linear-gradient(90deg, var(--feature-accent), transparent 78%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .login-feature-card:hover {
          transform: translateY(-3px);
          border-color: color-mix(in srgb, var(--feature-accent) 45%, var(--border));
          box-shadow: 0 12px 30px color-mix(in srgb, var(--feature-accent) 12%, transparent);
        }
        .login-feature-card:hover::before { opacity: 1; }
        .login-feature-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          margin-bottom: 0.8rem;
          border-radius: 10px;
          flex-shrink: 0;
        }
        .login-feature-title {
          margin: 0 0 0.38rem;
          font-size: 0.9rem;
          font-weight: 650;
          line-height: 1.32;
          letter-spacing: -0.008em;
          color: var(--text-1);
          overflow-wrap: break-word;
        }
        .login-feature-desc {
          margin: 0;
          font-size: 0.8rem;
          line-height: 1.6;
          color: var(--text-2);
          overflow-wrap: break-word;
        }
        @media (hover: none) {
          .login-feature-card:hover { transform: none; box-shadow: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-feature-card, .login-feature-card::before { transition: none; }
          .login-feature-card:hover { transform: none; }
        }

        /* Scroll reveal for the sections below the fold; browsers without
           scroll timelines simply show the content statically. */
        @keyframes loginScrollReveal {
          from { opacity: 0; translate: 0 28px; }
          to { opacity: 1; translate: 0 0; }
        }
        @media screen and (prefers-reduced-motion: no-preference) {
          @supports (animation-timeline: view()) {
            .login-how-inner,
            .login-features-head,
            .login-feature-card,
            .login-final-inner {
              animation: loginScrollReveal 1s linear both;
              animation-timeline: view();
              animation-range: entry 0% entry 75%;
            }
          }
        }

        @media (max-width: 480px) {
          .nav-brand { display: none; }
          .nav-login-label { display: none; }
          .nav-login-btn { padding: 0.42rem 0.6rem !important; }
          /* Fullscreen blur re-composites on every scroll frame; on phones the
             opaque bar reads the same. !important beats the inline style. */
          .login-navbar {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            background: var(--bg-2) !important;
          }
          .login-hero { padding: 2rem 1.15rem 1.75rem; }
          .login-brand-row { gap: 0.55rem 0.65rem; margin-bottom: 1rem; }
          .login-brand-icon { width: 38px; height: 38px; border-radius: 10px; }
          .login-hero-badge { padding: 0.24rem 0.65rem; gap: 6px; }
          .login-hero-badge-text { font-size: 0.61rem; letter-spacing: 0.045em; }
          .login-hero-title { font-size: clamp(1.5rem, 7vw, 2rem); line-height: 1.16; letter-spacing: -0.03em; }
          .login-hero-subtitle { margin-bottom: 1.5rem; font-size: 0.96rem; }
          .login-hero-actions { display: grid; grid-template-columns: 1fr; }
          .login-hero-actions > button { width: 100%; }
          .login-trust { gap: 0.4rem 0.9rem; margin-top: 1.25rem; }
          .login-trust li { font-size: 0.72rem; }
          .login-how { padding: 0 1.15rem 2.25rem; }
          .login-how-inner { padding: 1.25rem 1.1rem; border-radius: 18px; }
          .login-how-head { gap: 0.3rem; margin-bottom: 1.1rem; }
          .login-how-title { font-size: clamp(1rem, 4.6vw, 1.15rem); }
          .login-how-subtitle { font-size: 0.84rem; }
          .login-how-step { padding: 1rem 1.05rem 1.1rem; }
          .login-how-step-title { font-size: 0.92rem; }
          .login-how-step-desc { font-size: 0.8rem; }
          .login-features-section { padding: 0 1.15rem 2.5rem; }
          .login-features-title { font-size: 0.78rem; }
          .login-feature-card { padding: 1rem 1.05rem 1.05rem; }
          .login-final-cta { padding: 0 1.15rem 2.5rem; }
          .login-final-inner { padding: 1.75rem 1.15rem; border-radius: 20px; }
          .login-final-title { font-size: clamp(1.2rem, 5.8vw, 1.45rem); }
          .login-final-subtitle { font-size: 0.88rem; }
          .login-final-actions { display: grid; grid-template-columns: 1fr; margin-top: 1.25rem; }
          .login-final-actions > button { width: 100%; }
          .login-footer { padding: 1.25rem 1rem !important; }
        }
      `}</style>
    </div>
  );
}
