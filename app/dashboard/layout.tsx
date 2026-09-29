"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProducts } from "@/lib/hooks";
import { useLowStockNotifications } from "@/lib/notifications";
import { signOut } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-context";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LayoutGrid, Package, PackagePlus, BarChart2, Download, LogOut, ChevronRight, Upload, ClipboardList, Menu, X } from "lucide-react";

function NotificationWidget({ shopId }: { shopId: string | undefined }) {
  const { products } = useProducts(shopId);
  const { t } = useI18n();
  useLowStockNotifications(products);
  const n = products.filter((p) => p.minStock > 0 && p.totalQuantity <= p.minStock).length;
  if (n === 0) return null;
  return (
    <div style={{ margin: "0 0 0.5rem", background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "0.625rem 0.75rem", fontSize: "0.75rem", color: "var(--amber)", fontWeight: 600 }}>
      ⚠ {t("notify.lowStockBadge", { n })}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  if (loading) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;
  if (!user) return null;

  const NAV = [
    { href: "/dashboard", icon: LayoutGrid, label: t("nav.overview"), exact: true },
    { href: "/dashboard/analytics", icon: BarChart2, label: t("nav.analytics"), exact: false },
    { href: "/dashboard/receive", icon: PackagePlus, label: t("nav.receive"), exact: false },
    { href: "/dashboard/import", icon: Upload, label: t("nav.import"), exact: false },
    { href: "/dashboard/audit", icon: ClipboardList, label: t("nav.audit"), exact: false },
    { href: "/dashboard/export", icon: Download, label: t("nav.export"), exact: false },
    { href: "/dashboard/products", icon: Package, label: t("nav.products"), exact: false },
  ];

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh" }}>
      <header className="mobile-header">
        <button className="mobile-menu-button" type="button" aria-label={mobileNavOpen ? t("nav.closeMenu") : t("nav.openMenu")} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>
          {mobileNavOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <span className="mobile-brand"><span aria-hidden="true">📦</span> Inventory</span>
        <span className="mobile-user-name">{profile?.displayName ?? "—"}</span>
      </header>

      {mobileNavOpen && <button type="button" className="mobile-nav-backdrop" aria-label={t("nav.closeMenu")} onClick={() => setMobileNavOpen(false)} />}

      <aside className={`app-sidebar${mobileNavOpen ? " app-sidebar-open" : ""}`}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0.5rem", marginBottom: "1.75rem" }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 4px 12px var(--accent-glow)" }}>
            📦
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-1)" }}>Inventory</span>
        </div>

        <NotificationWidget shopId={profile?.shopId} />

        {/* Nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {NAV.map(({ href, icon: Icon, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setMobileNavOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.55rem 0.75rem", borderRadius: 10, fontSize: "0.875rem", fontWeight: 500, textDecoration: "none", transition: "all 0.15s", background: active ? "var(--accent-glow)" : "transparent", color: active ? "var(--accent-2)" : "var(--text-2)", border: active ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent" }}>
                <Icon size={16} />
                {label}
                {active && <ChevronRight size={14} style={{ marginLeft: "auto", opacity: 0.5 }} />}
              </Link>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* User card */}
        <div style={{ background: "var(--bg-3)", borderRadius: 12, padding: "0.75rem", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.5rem" }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg, var(--accent), #a855f7)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "white", flexShrink: 0 }}>
              {(profile?.displayName ?? "?")[0].toUpperCase()}
            </div>
            <div style={{ overflow: "hidden" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.displayName ?? "—"}</p>
              <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: 0 }}>{profile?.role === "owner" ? t("user.owner") : t("user.staff")}</p>
            </div>
          </div>

          {profile?.role === "owner" && profile.shopId && (
            <div style={{ background: "var(--bg-2)", borderRadius: 7, padding: "0.35rem 0.625rem", marginBottom: "0.5rem", fontSize: "0.68rem", color: "var(--text-3)" }}>
              <span style={{ color: "var(--text-2)" }}>{t("user.shopId")}: </span>
              <span style={{ fontFamily: "monospace", color: "var(--accent-2)", cursor: "pointer" }} onClick={() => navigator.clipboard.writeText(profile.shopId)} title="Copy">
                {profile.shopId.slice(0, 8)}…
              </span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "0.4rem" }}>
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>

          <button
            onClick={async () => { await signOut(); router.replace("/login"); }}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0.4rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.75rem", color: "var(--text-2)", cursor: "pointer", transition: "all 0.15s", marginTop: "0.4rem" }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--red-dim)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)"; }}
          >
            <LogOut size={13} />
            {t("user.logout")}
          </button>
        </div>
      </aside>

      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
