"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProducts, useShop, useShopMoney, useSalesInRange, useStornoedSaleIds } from "@/lib/hooks";
import { updateCatalogSettings } from "@/lib/actions";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { CATALOG_CHANNELS, CatalogChannels, hasAnyChannel, isValidChannel } from "@/lib/catalog-channels";
import CatalogBrandingFields from "@/components/CatalogBrandingFields";
import CurrencySettingsCard from "@/components/CurrencySettingsCard";
import DangerZone from "@/components/DangerZone";
import StatTiles, { type StatTile } from "@/components/StatTiles";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile } from "@/lib/types";
import { Plus, AlertTriangle, Package, TrendingDown, Layers, DollarSign, Store, Copy, Check, ExternalLink, ShoppingBag, RefreshCw, Users } from "lucide-react";
import styles from "@/components/settings-card.module.css";
import pageStyles from "./dashboard.module.css";

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
    <div className={`glass ${styles.card}`}>
      <div className={styles.head}>
        <div className={styles.icon}>
          <Store size={17} />
        </div>
        <div className={styles.headText}>
          <p className={styles.title}>{t("catalog.settingsTitle")}</p>
          <p className={styles.desc}>{t("catalog.settingsDesc")}</p>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.status} data-on={catalogEnabled || undefined}>
            {catalogEnabled ? t("catalog.on") : t("catalog.off")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={catalogEnabled}
            aria-label={t("catalog.settingsTitle")}
            className={styles.toggle}
            data-on={catalogEnabled || undefined}
            onClick={() => save(!catalogEnabled)}
            disabled={saving || (!catalogEnabled && !channelsValid)}
          />
        </div>
      </div>

      <div className={styles.channels}>
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
      <p className={styles.hint}>{t("catalog.channelsHint")}</p>

      <CatalogBrandingFields shopId={shopId} logoUrl={logoUrl} coverUrl={coverUrl} />

      {catalogEnabled && (
        <div className={styles.actions}>
          <a href={`/catalog/${shopId}`} target="_blank" rel="noopener noreferrer" className={`btn-secondary ${pageStyles.linkAsButton}`}>
            <ExternalLink size={13} /> {t("catalog.open")}
          </a>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { navigator.clipboard.writeText(catalogUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
            {copied ? t("catalog.copied") : t("catalog.copyLink")}
          </button>
          <button type="button" className="btn-secondary" onClick={() => save(true)} disabled={saving || !channelsValid}>
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
          <button type="button" className={styles.smallBtn} onClick={() => save(catalogEnabled)} disabled={disabled}>
            {t("catalog.saveContact")}
          </button>
        );
      })()}
      {error && <p className={styles.error}>{error}</p>}
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
    <section className={`glass ${styles.card}`}>
      <div className={styles.head}>
        <div className={styles.icon}>
          <Users size={17} />
        </div>
        <div className={styles.headText}>
          <p className={styles.title}>{t("catalog.staffAccessTitle")}</p>
          <p className={styles.desc}>{t("catalog.staffAccessDescription")}</p>
        </div>
      </div>
      {staffLoading ? (
        <div className={styles.skeletons} role="status" aria-label={t("catalog.staffLoading")}>
          <span className={styles.skeleton} />
          <span className={styles.skeleton} />
        </div>
      ) : staffMembers.length === 0 ? (
        <p className={styles.empty}>{t("catalog.staffEmpty")}</p>
      ) : (
        <div className={styles.list}>
          {staffMembers.map((member) => {
            const enabled = member.permissions?.manageCatalog === true;
            const savingMember = staffSavingUid === member.uid;
            return (
              <div key={member.uid} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.avatar} aria-hidden="true">
                    {member.displayName.trim().slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <div className={styles.rowBody}>
                    <p className={styles.rowName}>{member.displayName}</p>
                    <p className={styles.rowRole}>{t("user.staff")}</p>
                  </div>
                </div>
                <div className={styles.rowEnd}>
                  <span className={styles.rowStatus} data-on={enabled || undefined}>
                    {t(enabled ? "catalog.on" : "catalog.off")}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${t("catalog.staffCanManage")}: ${member.displayName}`}
                    disabled={savingMember}
                    onClick={() => setStaffCatalogAccess(member, !enabled)}
                    className={styles.toggle}
                    data-on={enabled || undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {staffError && <p role="alert" className={styles.error}>{staffError}</p>}
    </section>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const { products, loading } = useProducts(profile?.shopId);
  const { money } = useShopMoney(profile?.shopId, INTL_LOCALES[locale]);
  // The month figure must cover every sale of the month, not just the latest
  // page — a busy shop would otherwise under-report. A per-mount clock keeps
  // the range stable so the query does not resubscribe on every render.
  const [now] = useState(() => new Date());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { sales: monthSales } = useSalesInRange(profile?.shopId, monthStart, now);
  const stornoedIds = useStornoedSaleIds(profile?.shopId);
  const lowStock = products.filter((p) => p.minStock > 0 && p.totalQuantity <= p.minStock);
  const totalItems = products.reduce((s, p) => s + p.totalQuantity, 0);
  const inventoryValue = products
    .filter((p) => p.costPrice && p.costPrice > 0)
    .reduce((s, p) => s + (p.costPrice ?? 0) * p.totalQuantity, 0);
  const hasValue = inventoryValue > 0;

  // A storno annuls its original sale: both the reversed sale and its storno
  // document stay out of the month total, so only sales that still stand count.
  const monthRevenue = monthSales
    .filter((s) => !s.stornoOf && !stornoedIds.has(s.id))
    .reduce((sum, s) => sum + s.total, 0);

  if (loading) return <div className={pageStyles.loading}><div className="spinner" /></div>;

  const tiles: StatTile[] = [
    { icon: <Package size={16} />, label: t("dashboard.totalProducts"), value: products.length, tone: "var(--accent-2)" },
    { icon: <Layers size={16} />, label: t("dashboard.totalItems"), value: totalItems.toLocaleString(INTL_LOCALES[locale]), tone: "var(--cyan)" },
    { icon: <TrendingDown size={16} />, label: t("dashboard.lowStock"), value: lowStock.length, tone: lowStock.length > 0 ? "var(--amber)" : "var(--green)" },
    ...(hasValue ? [{ icon: <DollarSign size={16} />, label: t("dashboard.inventoryValue"), value: money(inventoryValue, { maximumFractionDigits: 0 }), tone: "var(--violet)" }] : []),
    ...(monthRevenue > 0 ? [{ icon: <ShoppingBag size={16} />, label: t("dashboard.monthRevenue"), value: money(monthRevenue, { minimumFractionDigits: 2 }), tone: "var(--green)" }] : []),
  ];

  return (
    <div className={`fade-up ${pageStyles.page}`}>
      <header className={pageStyles.header}>
        <div className={pageStyles.headMain}>
          <h1 className={pageStyles.title}>
            {profile?.displayName ? t("dashboard.greetingName", { name: profile.displayName.split(" ")[0] }) : t("dashboard.greeting")}
          </h1>
          <p className={pageStyles.subtitle}>{t("dashboard.subtitle")}</p>
        </div>
        <Link href="/dashboard/products/new" className={`btn-primary ${pageStyles.newBtn}`}>
          <Plus size={15} />
          {t("dashboard.newProduct")}
        </Link>
      </header>

      <StatTiles items={tiles} size="lg" label={t("nav.overview")} />

      {lowStock.length > 0 && (
        <div className={pageStyles.alert} role="status">
          <AlertTriangle size={15} strokeWidth={2.5} />
          {t("dashboard.lowStockAlert", { n: lowStock.length })}
        </div>
      )}

      {profile?.role === "owner" && profile.shopId && (
        <CurrencySettingsCard shopId={profile.shopId} />
      )}
      {profile?.shopId && (profile.role === "owner" || profile.permissions?.manageCatalog === true) && (
        <CatalogSettingsCard shopId={profile.shopId} />
      )}
      {profile?.role === "owner" && profile.shopId && (
        <StaffCatalogAccessCard shopId={profile.shopId} />
      )}

      {profile?.shopId && <DangerZone shopId={profile.shopId} />}
    </div>
  );
}
