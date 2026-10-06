"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useShop, useShopMoney, useSales } from "@/lib/hooks";
import { updateCatalogSettings } from "@/lib/actions";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { CATALOG_CHANNELS, CatalogChannels, hasAnyChannel, isValidChannel } from "@/lib/catalog-channels";
import CatalogBrandingFields from "@/components/CatalogBrandingFields";
import CurrencySettingsCard from "@/components/CurrencySettingsCard";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile } from "@/lib/types";
import { Plus, AlertTriangle, Package, TrendingDown, Layers, DollarSign, Store, Copy, Check, ExternalLink, ShoppingBag, RefreshCw, Users } from "lucide-react";

function CatalogSettingsCard({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const { catalogEnabled, channels, logoUrl, coverUrl, loading } = useShop(shopId);
  const [draft, setDraft] = useState<CatalogChannels | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const effectiveChannels = draft ?? channels;
  const channelsValid = hasAnyChannel(effectiveChannels);
  const catalogUrl = typeof window !== "undefined" ? `${window.location.origin}/catalog/${shopId}` : "";

  async function save(enabled: boolean) {
    setError(""); setSaving(true);
    try {
      await updateCatalogSettings(shopId, { enabled, channels: effectiveChannels });
      setDraft(null);
    } catch (err: unknown) {
      setError(translateError(err, t, "catalog.error"));
    } finally { setSaving(false); }
  }

  if (loading) return null;

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Store size={17} color="var(--accent-2)" />
          </div>
          <div>
            <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("catalog.settingsTitle")}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("catalog.settingsDesc")}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: catalogEnabled ? "var(--green)" : "var(--text-3)" }}>
            {catalogEnabled ? t("catalog.on") : t("catalog.off")}
          </span>
          <button
            onClick={() => save(!catalogEnabled)}
            disabled={saving || (!catalogEnabled && !channelsValid)}
            aria-pressed={catalogEnabled}
            style={{
              width: 44, height: 24, borderRadius: 99, position: "relative", cursor: "pointer",
              border: "none", transition: "background 0.2s",
              background: catalogEnabled ? "var(--accent)" : "var(--bg-3)",
              opacity: saving ? 0.6 : 1,
            }}>
            <span style={{
              position: "absolute", top: 3, left: catalogEnabled ? 23 : 3, width: 18, height: 18,
              borderRadius: "50%", background: "white", transition: "left 0.2s",
            }} />
          </button>
        </div>
      </div>

      <div className="catalog-channels">
        {CATALOG_CHANNELS.map((channel) => {
          const value = effectiveChannels[channel];
          const invalid = value.trim() !== "" && !isValidChannel(channel, value);
          return (
            <input key={channel} className="input" type={channel === "whatsapp" ? "tel" : "text"} inputMode={channel === "whatsapp" ? "tel" : "text"}
              aria-label={t(`catalog.${channel}Placeholder`)} placeholder={t(`catalog.${channel}Placeholder`)} value={value} aria-invalid={invalid || undefined}
              onChange={(e) => setDraft({ ...effectiveChannels, [channel]: e.target.value })}
              style={invalid ? { borderColor: "var(--red)" } : undefined} />
          );
        })}
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("catalog.channelsHint")}</p>

      <CatalogBrandingFields shopId={shopId} logoUrl={logoUrl} coverUrl={coverUrl} />

      {catalogEnabled && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <a href={`/catalog/${shopId}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--accent-2)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 9, padding: "0.5rem 0.8rem" }}>
            <ExternalLink size={13} /> {t("catalog.open")}
          </a>
          <button
            onClick={() => { navigator.clipboard.writeText(catalogUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 9, padding: "0.5rem 0.8rem", cursor: "pointer" }}>
            {copied ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
            {copied ? t("catalog.copied") : t("catalog.copyLink")}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving || !channelsValid}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 9, padding: "0.5rem 0.8rem", cursor: saving || !channelsValid ? "default" : "pointer", opacity: saving || !channelsValid ? 0.6 : 1 }}>
            <RefreshCw size={13} /> {t("catalog.refreshStock")}
          </button>
        </div>
      )}
      {(() => {
        // While the catalog is off, a contact is optional. Once it is on, a
        // publishable channel is required or customers would have no way to
        // order, so the save stays disabled until one is valid.
        const needsChannel = catalogEnabled && !channelsValid;
        const disabled = saving || draft === null || needsChannel;
        return (
          <button onClick={() => save(catalogEnabled)} disabled={disabled}
            style={{ alignSelf: "flex-start", fontSize: "0.75rem", color: "var(--accent-2)", background: "none", border: "none", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, padding: 0 }}>
            {t("catalog.saveContact")}
          </button>
        );
      })()}
      {error && <p style={{ fontSize: "0.78rem", color: "var(--red)", margin: 0 }}>{error}</p>}
    </div>
  );
}

function StaffCatalogAccessCard({ shopId }: { shopId: string }) {
  const { t } = useI18n();
  const [staffMembers, setStaffMembers] = useState<UserProfile[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffSavingUid, setStaffSavingUid] = useState<string | null>(null);
  const [staffError, setStaffError] = useState("");

  useEffect(() => onSnapshot(query(collection(db, "users"), where("shopId", "==", shopId)), (snapshot) => {
    const members = snapshot.docs
      .map((memberDoc) => {
        const data = memberDoc.data();
        return {
          uid: memberDoc.id,
          shopId: data.shopId ?? "",
          displayName: data.displayName ?? "",
          role: data.role === "owner" ? "owner" as const : "staff" as const,
          permissions: { manageCatalog: data.permissions?.manageCatalog === true },
        };
      })
      .filter((member) => member.role === "staff")
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    setStaffMembers(members);
    setStaffLoading(false);
    setStaffError("");
  }, () => {
    setStaffLoading(false);
    setStaffError(t("catalog.staffAccessError"));
  }), [shopId, t]);

  async function setStaffCatalogAccess(member: UserProfile, enabled: boolean) {
    setStaffSavingUid(member.uid);
    setStaffError("");
    try {
      await updateDoc(doc(db, "users", member.uid), { permissions: { manageCatalog: enabled } });
    } catch (err: unknown) {
      setStaffError(translateError(err, t, "catalog.staffAccessError"));
    } finally {
      setStaffSavingUid(null);
    }
  }

  return (
    <section style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-3)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Users size={17} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("catalog.staffAccessTitle")}</p>
          <p style={{ fontSize: "0.72rem", lineHeight: 1.45, color: "var(--text-3)", margin: "0.15rem 0 0" }}>{t("catalog.staffAccessDescription")}</p>
        </div>
      </div>
      {staffLoading ? (
        <div role="status" aria-label={t("catalog.staffLoading")} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <span style={{ height: 42, borderRadius: 9, background: "var(--bg-3)", opacity: 0.7 }} />
          <span style={{ height: 42, borderRadius: 9, background: "var(--bg-3)", opacity: 0.45 }} />
        </div>
      ) : staffMembers.length === 0 ? (
        <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: 0, padding: "0.65rem 0 0", borderTop: "1px solid var(--border)" }}>{t("catalog.staffEmpty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {staffMembers.map((member) => {
            const enabled = member.permissions?.manageCatalog === true;
            const savingMember = staffSavingUid === member.uid;
            return (
              <div key={member.uid} style={{ minHeight: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.8rem", borderTop: "1px solid var(--border)", padding: "0.55rem 0" }}>
                <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "0.65rem" }}>
                  <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-glow)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.72rem", fontWeight: 750 }}>
                    {member.displayName.trim().slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, overflow: "hidden", color: "var(--text-1)", fontSize: "0.76rem", fontWeight: 650, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.displayName}</p>
                    <p style={{ margin: "0.12rem 0 0", color: "var(--text-3)", fontSize: "0.67rem" }}>{t("user.staff")}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.55rem", flexShrink: 0 }}>
                  <span style={{ minWidth: 66, color: enabled ? "var(--green)" : "var(--text-3)", fontSize: "0.68rem", fontWeight: 650, textAlign: "right" }}>
                    {t(enabled ? "catalog.on" : "catalog.off")}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${t("catalog.staffCanManage")}: ${member.displayName}`}
                    disabled={savingMember}
                    onClick={() => setStaffCatalogAccess(member, !enabled)}
                    style={{ width: 42, height: 24, display: "flex", alignItems: "center", justifyContent: enabled ? "flex-end" : "flex-start", padding: 3, border: `1px solid ${enabled ? "var(--accent)" : "var(--border)"}`, borderRadius: 99, background: enabled ? "var(--accent)" : "var(--bg-3)", cursor: savingMember ? "wait" : "pointer", opacity: savingMember ? 0.65 : 1, transition: "background 0.16s, border-color 0.16s, opacity 0.16s" }}
                  >
                    <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--bg-2)", boxShadow: "0 1px 3px rgba(0,0,0,0.22)" }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {staffError && <p role="alert" style={{ fontSize: "0.75rem", color: "var(--red)", margin: 0 }}>{staffError}</p>}
    </section>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const { money } = useShopMoney(profile?.shopId, INTL_LOCALES[locale]);
  const { sales } = useSales(profile?.shopId, 200);
  const lowStock = products.filter((p) => p.minStock > 0 && p.totalQuantity <= p.minStock);
  const totalItems = products.reduce((s, p) => s + p.totalQuantity, 0);
  const inventoryValue = products
    .filter((p) => p.costPrice && p.costPrice > 0)
    .reduce((s, p) => s + (p.costPrice ?? 0) * p.totalQuantity, 0);
  const hasValue = inventoryValue > 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRevenue = sales
    .filter((s) => s.createdAt && s.createdAt >= monthStart)
    .reduce((sum, s) => sum + s.total, 0);

  if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

  const stats = [
    { icon: Package, label: t("dashboard.totalProducts"), value: products.length, color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
    { icon: Layers, label: t("dashboard.totalItems"), value: totalItems, color: "#22d3ee", bg: "rgba(34,211,238,0.08)" },
    { icon: TrendingDown, label: t("dashboard.lowStock"), value: lowStock.length, color: lowStock.length > 0 ? "var(--amber)" : "var(--green)", bg: lowStock.length > 0 ? "var(--amber-dim)" : "var(--green-dim)" },
    ...(hasValue ? [{ icon: DollarSign, label: t("dashboard.inventoryValue"), value: money(inventoryValue, { maximumFractionDigits: 0 }), color: "#a855f7", bg: "rgba(168,85,247,0.1)" }] : []),
    ...(monthRevenue > 0 ? [{ icon: ShoppingBag, label: t("dashboard.monthRevenue"), value: money(monthRevenue, { minimumFractionDigits: 2 }), color: "var(--green)", bg: "var(--green-dim)" }] : []),
  ];

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0, color: "var(--text-1)", letterSpacing: "-0.03em" }}>
            {profile?.displayName ? t("dashboard.greetingName", { name: profile.displayName.split(" ")[0] }) : t("dashboard.greeting")}
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-3)", marginTop: 3 }}>{t("dashboard.subtitle")}</p>
        </div>
        <Link href="/dashboard/products/new" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", fontSize: "0.875rem" }}>
          <Plus size={15} />{t("dashboard.newProduct")}
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: "0.875rem" }} className="dashboard-stats">
        {stats.map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.25rem 1.4rem", display: "flex", alignItems: "center", gap: "1rem", transition: "border-color 0.2s" }}
            onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = color + "44"; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
          >
            <div style={{ width: 44, height: 44, background: bg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={19} color={color} strokeWidth={2} />
            </div>
            <div>
              <p style={{ fontSize: "1.65rem", fontWeight: 800, margin: 0, color: "var(--text-1)", lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</p>
              <p style={{ fontSize: "0.73rem", color: "var(--text-3)", margin: "4px 0 0", fontWeight: 500 }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Shop settings (owner only) */}
      {profile?.role === "owner" && profile.shopId && (
        <CurrencySettingsCard shopId={profile.shopId} />
      )}
      {profile?.shopId && (profile.role === "owner" || profile.permissions?.manageCatalog === true) && (
        <CatalogSettingsCard shopId={profile.shopId} />
      )}
      {profile?.role === "owner" && profile.shopId && (
        <StaffCatalogAccessCard shopId={profile.shopId} />
      )}

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div style={{ background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <AlertTriangle size={15} color="var(--amber)" strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "0.83rem", color: "var(--amber)", fontWeight: 700 }}>{t("dashboard.lowStockAlert", { n: lowStock.length })}</span>
        </div>
      )}

    </div>
  );
}
