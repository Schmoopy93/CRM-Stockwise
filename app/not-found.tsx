"use client";

import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import styles from "./status.module.css";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <main className={`fade-up ${styles.page}`}>
      <section className={styles.card} aria-labelledby="not-found-title">
        <span className={`${styles.icon} ${styles.iconMuted}`} aria-hidden="true"><Compass size={26} /></span>
        <p className={styles.statusCode}>404</p>
        <h1 id="not-found-title" className={styles.title}>{t("notFound.title")}</h1>
        <p className={styles.body}>{t("notFound.body")}</p>
        <div className={styles.actions}>
          <Link href="/" className={styles.link}>
            <ArrowLeft size={14} aria-hidden="true" /> {t("notFound.home")}
          </Link>
        </div>
      </section>
    </main>
  );
}
