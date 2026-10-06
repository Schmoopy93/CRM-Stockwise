"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { ArrowLeft, Archive, Building2, Database, FileText, Lock, Scale, Settings2, Share2, ShieldCheck, UserCheck } from "lucide-react";
import styles from "../legal.module.css";

type Block = { kind: "p"; key: string } | { kind: "ul"; keys: string[] };
type Section = { titleKey: string; icon: React.ReactNode; blocks: Block[] };

const p = (key: string): Block => ({ kind: "p", key });
const ul = (keys: string[]): Block => ({ kind: "ul", keys });

const SECTIONS: Section[] = [
  { titleKey: "legal.privacy.s1Title", icon: <Building2 size={17} />, blocks: [p("legal.privacy.s1Body")] },
  {
    titleKey: "legal.privacy.s2Title", icon: <Database size={17} />,
    blocks: [p("legal.privacy.s2Body"), ul(["legal.privacy.s2b1", "legal.privacy.s2b2", "legal.privacy.s2b3", "legal.privacy.s2b4"])],
  },
  { titleKey: "legal.privacy.s3Title", icon: <Settings2 size={17} />, blocks: [p("legal.privacy.s3Body")] },
  { titleKey: "legal.privacy.s4Title", icon: <Scale size={17} />, blocks: [p("legal.privacy.s4Body")] },
  { titleKey: "legal.privacy.s5Title", icon: <Share2 size={17} />, blocks: [p("legal.privacy.s5Body")] },
  { titleKey: "legal.privacy.s6Title", icon: <Archive size={17} />, blocks: [p("legal.privacy.s6Body")] },
  {
    titleKey: "legal.privacy.s7Title", icon: <UserCheck size={17} />,
    blocks: [
      p("legal.privacy.s7Body"),
      ul(["legal.privacy.s7b1", "legal.privacy.s7b2", "legal.privacy.s7b3", "legal.privacy.s7b4", "legal.privacy.s7b5"]),
      p("legal.privacy.s7Body2"),
    ],
  },
  { titleKey: "legal.privacy.s8Title", icon: <Lock size={17} />, blocks: [p("legal.privacy.s8Body")] },
  { titleKey: "legal.privacy.s9Title", icon: <FileText size={17} />, blocks: [p("legal.privacy.s9Body")] },
];

export default function PrivacyPage() {
  const { t } = useI18n();
  const vars = { email: t("legal.contactEmail"), operator: t("legal.operator") };

  return (
    <main className={`fade-up ${styles.page}`}>
      <Link href="/" className="pform-back" style={{ alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.heroIcon} aria-hidden="true"><ShieldCheck size={22} /></span>
          <div>
            <h1 className={styles.title}>{t("legal.privacy.title")}</h1>
            <p className={styles.updated}>{t("legal.privacy.updated")}</p>
          </div>
        </div>
        <p className={styles.intro}>{t("legal.privacy.intro")}</p>
      </header>

      <div className={styles.callout} role="note">
        <span className={styles.calloutIcon} aria-hidden="true"><Lock size={20} /></span>
        <p className={styles.calloutText}>{t("legal.privacy.callout")}</p>
      </div>

      {SECTIONS.map((section, index) => {
        const headingId = `privacy-s${index + 1}-title`;
        return (
          <section key={section.titleKey} className={styles.section} aria-labelledby={headingId}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon} aria-hidden="true">{section.icon}</span>
              <h2 id={headingId} className={styles.sectionTitle}>{t(section.titleKey)}</h2>
              <span className={styles.sectionIndex}>{String(index + 1).padStart(2, "0")}</span>
            </div>
            {section.blocks.map((block) =>
              block.kind === "p" ? (
                <p key={block.key} className={styles.para}>{t(block.key, vars)}</p>
              ) : (
                <ul key={block.keys[0]} className={styles.list}>
                  {block.keys.map((key) => <li key={key} className={styles.listItem}>{t(key, vars)}</li>)}
                </ul>
              )
            )}
          </section>
        );
      })}

      <nav className={styles.related} aria-label={t("legal.seeAlso")}>
        <Link href="/terms" className={styles.relatedLink}>{t("legal.terms.title")}</Link>
        <Link href="/cookies" className={styles.relatedLink}>{t("cookies.title")}</Link>
      </nav>
    </main>
  );
}
