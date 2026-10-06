"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { ArrowLeft, Cookie, ExternalLink, Megaphone, Settings2, ShieldCheck } from "lucide-react";
import styles from "./cookies.module.css";

const ITEMS = [
  { name: "inventory-locale", typeKey: "cookies.typeCookie", purposeKey: "cookies.purposeLocale", durationKey: "cookies.durationYear" },
  { name: "inventory-locale, inventory-theme", typeKey: "cookies.typeStorage", purposeKey: "cookies.purposePreferences", durationKey: "cookies.durationPersistent" },
  { name: "inventory-cookie-notice", typeKey: "cookies.typeStorage", purposeKey: "cookies.purposeNotice", durationKey: "cookies.durationPersistent" },
  { name: "Firebase Authentication", typeKey: "cookies.typeIndexedDb", purposeKey: "cookies.purposeAuth", durationKey: "cookies.durationSession" },
];

export default function CookiesPage() {
  const { t } = useI18n();

  return (
    <main className={`fade-up ${styles.page}`}>
      <Link href="/" className={styles.back}>
        <ArrowLeft size={15} /> {t("back")}
      </Link>

      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.heroIcon} aria-hidden="true"><ShieldCheck size={22} /></span>
          <div>
            <h1 className={styles.title}>{t("cookies.title")}</h1>
            <p className={styles.updated}>{t("cookies.updated")}</p>
          </div>
        </div>
        <p className={styles.intro}>{t("cookies.intro")}</p>
      </header>

      <div className={styles.callout} role="note">
        <span className={styles.calloutIcon} aria-hidden="true"><ShieldCheck size={20} /></span>
        <p className={styles.calloutText}>{t("cookies.notice")}</p>
      </div>

      <section className={styles.section} aria-labelledby="cookies-used-title">
        <div className={styles.sectionHeading}>
          <span className={styles.sectionIcon} aria-hidden="true"><Cookie size={17} /></span>
          <h2 id="cookies-used-title" className={styles.sectionTitle}>{t("cookies.usedTitle")}</h2>
          <span className={styles.sectionIndex}>01</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("cookies.colName")}</th>
                <th scope="col">{t("cookies.colType")}</th>
                <th scope="col">{t("cookies.colPurpose")}</th>
                <th scope="col">{t("cookies.colDuration")}</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item.name + item.typeKey}>
                  <td><code className={styles.name}>{item.name}</code></td>
                  <td><span className={styles.type}>{t(item.typeKey)}</span></td>
                  <td>{t(item.purposeKey)}</td>
                  <td className={styles.duration}>{t(item.durationKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.mobileList}>
          {ITEMS.map((item) => (
            <article key={item.name + item.typeKey} className={styles.entry}>
              <header className={styles.entryHeader}>
                <code className={styles.name}>{item.name}</code>
                <span className={styles.type}>{t(item.typeKey)}</span>
              </header>
              <div className={styles.entryPurpose}>
                <span>{t("cookies.colPurpose")}</span>
                <p>{t(item.purposeKey)}</p>
              </div>
              <div className={styles.entryDuration}>
                <span>{t("cookies.colDuration")}</span>
                <span>{t(item.durationKey)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.infoGrid}>
        <section className={styles.infoSection} aria-labelledby="cookies-third-party-title">
          <span className={styles.infoIcon} aria-hidden="true"><ExternalLink size={17} /></span>
          <div>
            <h2 id="cookies-third-party-title" className={styles.infoTitle}>{t("cookies.thirdPartyTitle")}</h2>
            <p className={styles.infoText}>{t("cookies.thirdParty")}</p>
          </div>
        </section>

        <section className={styles.infoSection} aria-labelledby="cookies-manage-title">
          <span className={styles.infoIcon} aria-hidden="true"><Settings2 size={17} /></span>
          <div>
            <h2 id="cookies-manage-title" className={styles.infoTitle}>{t("cookies.manageTitle")}</h2>
            <p className={styles.infoText}>{t("cookies.manage")}</p>
          </div>
        </section>

        <section className={`${styles.infoSection} ${styles.infoWide}`} aria-labelledby="cookies-ads-title">
          <span className={styles.infoIcon} aria-hidden="true"><Megaphone size={17} /></span>
          <div>
            <h2 id="cookies-ads-title" className={styles.infoTitle}>{t("cookies.adsTitle")}</h2>
            <p className={styles.infoText}>{t("cookies.ads")}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
