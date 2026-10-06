"use client";



import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useOrders } from "@/lib/hooks";
import { useCustomerMessageNotifications, useLowStockNotifications } from "@/lib/notifications";
import { signOut } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-context";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LayoutGrid, Package, PackagePlus, BarChart2, Download, LogOut, ChevronRight, Upload, ClipboardList, Menu, X, ShoppingBag, AlertTriangle, Receipt, Users, Bell, MessageCircle } from "lucide-react";

function NotificationWidget({ shopId }: { shopId: string | undefined }) {
  const { products } = useProducts(shopId);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useLowStockNotifications(products);
  const low = products
    .filter((p) => p.minStock > 0 && p.totalQuantity <= p.minStock)
    .sort((a, b) => (a.totalQuantity / Math.max(a.minStock, 1)) - (b.totalQuantity / Math.max(b.minStock, 1)));
  if (low.length === 0) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", margin: "0 0 0.5rem", background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "0.625rem 0.75rem", fontSize: "0.75rem", color: "var(--amber)", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, textAlign: "left" }}>
        <AlertTriangle size={13} style={{ flexShrink: 0 }} />
        {t("notify.lowStockBadge", { n: low.length })}
        <ChevronRight size={13} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ margin: "0 0 0.5rem", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.4rem", display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto" }}>
          {low.map((p) => (
            <Link key={p.id} href={`/dashboard/products/${p.id}`} onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0.45rem 0.5rem", borderRadius: 7, textDecoration: "none", color: "var(--text-1)", fontSize: "0.75rem" }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ color: p.totalQuantity === 0 ? "var(--red)" : "var(--amber)", fontWeight: 700, flexShrink: 0 }}>{p.totalQuantity}/{p.minStock}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewOrderToast({ shopId }: { shopId: string }) {
  const { orders, loading } = useOrders(shopId, 50);
  const { t } = useI18n();
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!initializedRef.current) {
      for (const o of orders) seenRef.current.add(o.id);
      initializedRef.current = true;
      return;
    }
    const fresh = orders.filter((o) => o.status === "new" && !seenRef.current.has(o.id));
    if (fresh.length === 0) return;
    for (const o of fresh) seenRef.current.add(o.id);
    setToasts((prev) => [
      ...prev,
      ...fresh.map((o) => ({ id: o.id, text: t("notify.newOrderToast", { code: o.code, name: o.customerName }) })),
    ]);
  }, [orders, loading, t]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 999, display: "flex", flexDirection: "column", gap: "0.5rem", pointerEvents: "none" }}>
      {toasts.map((toast) => (
        <div key={toast.id} className="fade-up" style={{ background: "var(--bg-2)", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 12, padding: "0.75rem 1rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-1)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 8, maxWidth: 320 }}>
          <Bell size={15} color="var(--accent-2)" style={{ flexShrink: 0 }} />
          {toast.text}
        </div>
      ))}
    </div>
  );
}

type NavItem = { href: string; icon: React.ElementType; label: string; exact: boolean; badge?: boolean };

function NewOrderBadgeNav({ shopId, nav, pathname, onNavigate }: {
  shopId: string;
  nav: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  const { orders, loading } = useOrders(shopId, 50);
  const { t } = useI18n();
  const newCount = loading ? 0 : orders.filter((o) => o.status === "new").length;
  const { unreadOrderIds, unreadConversationIds, toasts, dismissToast } = useCustomerMessageNotifications(shopId, orders, loading);
  const unreadMessageCount = unreadOrderIds.size + unreadConversationIds.size;
  const badgeCount = newCount + unreadMessageCount;

  return (
    <>
      {nav.map(({ href, icon: Icon, label, exact, badge }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        const count = badge ? badgeCount : 0;
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-label={badge ? t("notify.orderBadge", { orders: newCount, messages: unreadMessageCount }) : undefined}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.55rem 0.75rem", borderRadius: 10, fontSize: "0.875rem", fontWeight: 500, textDecoration: "none", transition: "all 0.15s", background: active ? "var(--accent-glow)" : "transparent", color: active ? "var(--accent-2)" : "var(--text-2)", border: active ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent" }}>
            <Icon size={16} />
            {label}
            {count > 0 && (
              <span style={{ marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 99, background: "var(--accent)", color: "white", fontSize: "0.65rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                {count}
              </span>
            )}
            {count === 0 && active && <ChevronRight size={14} style={{ marginLeft: "auto", opacity: 0.5 }} />}
          </Link>
        );
      })}
      {toasts.length > 0 && (
        typeof document !== "undefined" && createPortal(
          <div aria-live="polite" style={{ position: "fixed", right: "1.25rem", bottom: "1.25rem", zIndex: 999, display: "flex", flexDirection: "column", gap: "0.5rem", width: "min(360px, calc(100vw - 2rem))" }}>
            {toasts.map((toast) => (
              <div key={toast.id} className="fade-up" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.8rem", border: "1px solid color-mix(in srgb, var(--accent-2) 35%, var(--border))", borderRadius: 12, background: "var(--bg-2)", boxShadow: "0 8px 28px rgba(0,0,0,0.22)" }}>
                <MessageCircle size={17} color="var(--accent-2)" style={{ flexShrink: 0 }} />
                <Link href={toast.conversationId
                  ? `/dashboard/orders#conversation-${toast.conversationId}`
                  : toast.orderId
                    ? `/dashboard/orders#order-chat-${toast.orderId}`
                    : "/dashboard/orders"} onClick={() => { dismissToast(toast.id); onNavigate(); }}
                  style={{ minWidth: 0, flex: 1, color: "var(--text-1)", textDecoration: "none", fontSize: "0.8rem", fontWeight: 650 }}>
                  {toast.conversationId
                    ? t("notify.newShopConversationToast", { email: toast.name })
                    : t("notify.newCustomerMessageToast", { code: toast.code, name: toast.name })}
                </Link>
                <button type="button" onClick={() => dismissToast(toast.id)} aria-label={t("catalog.close")}
                  style={{ display: "grid", placeItems: "center", width: 27, height: 27, flex: "0 0 auto", border: 0, borderRadius: 7, background: "var(--bg-3)", color: "var(--text-2)", cursor: "pointer" }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>,
          document.body
        )
      )}
    </>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!profile) {
      void signOut().finally(() => router.replace("/login?setup=1"));
    }
  }, [user, profile, loading, router]);

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
  if (!user || !profile) return null;

  const NAV = [
    { href: "/dashboard", icon: LayoutGrid, label: t("nav.overview"), exact: true },
    { href: "/dashboard/analytics", icon: BarChart2, label: t("nav.analytics"), exact: false },
    { href: "/dashboard/receive", icon: PackagePlus, label: t("nav.receive"), exact: false },
    { href: "/dashboard/sales", icon: ShoppingBag, label: t("nav.sales"), exact: false },
    { href: "/dashboard/orders", icon: Receipt, label: t("nav.orders"), exact: false, badge: true },
    { href: "/dashboard/customers", icon: Users, label: t("nav.customers"), exact: false },
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
        <span className="mobile-brand"><Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={20} height={20} style={{ width: 20, height: 20, borderRadius: 5, objectFit: "cover", verticalAlign: "-5px", marginRight: 4 }} />{t("brand")}</span>
        <span className="mobile-user-name">{profile?.displayName ?? "—"}</span>
      </header>

      {mobileNavOpen && <button type="button" className="mobile-nav-backdrop" aria-label={t("nav.closeMenu")} onClick={() => setMobileNavOpen(false)} />}

      <aside className={`app-sidebar${mobileNavOpen ? " app-sidebar-open" : ""}`}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0.5rem", marginBottom: "1.75rem" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 12px var(--accent-glow)", flexShrink: 0 }}>
            <Image src="/android-chrome-512x512.png" alt="" aria-hidden="true" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-1)" }}>{t("brand")}</span>
        </div>

        <NotificationWidget shopId={profile?.shopId} />

        {/* Nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <NewOrderBadgeNav shopId={profile.shopId} nav={NAV} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
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
            <LanguageSwitcher variant="dropdown" />
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
      <NewOrderToast shopId={profile.shopId} />
    </div>
  );
}
