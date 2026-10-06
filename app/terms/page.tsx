"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { ArrowLeft, Ban, ClipboardCheck, Copyright, FileText, Folder, Mail, Package, Scale, Server, Store, Trash2, User } from "lucide-react";
import styles from "../legal.module.css";

type Block = { kind: "p"; key: string } | { kind: "ul"; keys: string[] };
type Section = { titleKey: string; icon: React.ReactNode; blocks: Block[] };

const p = (key: string): Block => ({ kind: "p", key });
const ul = (keys: string[]): Block => ({ kind: "ul", keys });

const SECTIONS: Section[] = [
  { titleKey: "legal.terms.t1Title", icon: <ClipboardCheck size={17} />, blocks: [p("legal.terms.t1Body")] },
  { titleKey: "legal.terms.t2Title", icon: <Package size={17} />, blocks: [p("legal.terms.t2Body")] },
  { titleKey: "legal.terms.t3Title", icon: <User size={17} />, blocks: [p("legal.terms.t3Body")] },
  {
    titleKey: "legal.terms.t4Title", icon: <Ban size={17} />,
    blocks: [p("legal.terms.t4Body"), ul(["legal.terms.t4b1", "legal.terms.t4b2", "legal.terms.t4b3", "legal.terms.t4b4"])],
  },
  { titleKey: "legal.terms.t5Title", icon: <Folder size={17} />, blocks: [p("legal.terms.t5Body")] },
  { titleKey: "legal.terms.t6Title", icon: <Store size={17} />, blocks: [p("legal.terms.t6Body")] },
  { titleKey: "legal.terms.t7Title", icon: <Server size={17} />, blocks: [p("legal.terms.t7Body")] },
  { titleKey: "legal.terms.t8Title", icon: <Copyright size={17} />, blocks: [p("legal.terms.t8Body")] },
  { titleKey: "legal.terms.t9Title", icon: <Scale size={17} />, blocks: [p("legal.terms.t9Body")] },
  { titleKey: "legal.terms.t10Title", icon: <Trash2 size={17} />, blocks: [p("legal.terms.t10Body")] },
  { titleKey: "legal.terms.t11Title", icon: <Mail size={17} />, blocks: [p("legal.terms.t11Body")] },
];

export default function TermsPage() {
  const { t } = useI18n();
  const vars = { email: t("legal.contactEmail"), operator: t("legal.operator") };

  return (
    <main className={`fade-up ${styles.page}`}>
      <Link href="/" className="pform-back" style={{ alignSelf: "flex-start" }}>
        <ArrowLeft size={14} /> {t("back")}
      </Link>

      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.heroIcon} aria-hidden="true"><FileText size={22} /></span>
          <div>
            <h1 className={styles.title}>{t("legal.terms.title")}</h1>
            <p className={styles.updated}>{t("legal.terms.updated")}</p>
          </div>
        </div>
        <p className={styles.intro}>{t("legal.terms.intro")}</p>
      </header>

      <div className={styles.callout} role="note">
        <span className={styles.calloutIcon} aria-hidden="true"><Scale size={20} /></span>
        <p className={styles.calloutText}>{t("legal.terms.callout")}</p>
      </div>

      {SECTIONS.map((section, index) => {
        const headingId = `terms-t${index + 1}-title`;
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
        <Link href="/privacy" className={styles.relatedLink}>{t("legal.privacy.title")}</Link>
        <Link href="/cookies" className={styles.relatedLink}>{t("cookies.title")}</Link>
      </nav>
    </main>
  );
}
