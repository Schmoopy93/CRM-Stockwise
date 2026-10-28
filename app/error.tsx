"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";
import { reportClientError } from "@/lib/client-errors";
import { useI18n } from "@/lib/i18n-context";
import styles from "./status.module.css";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    reportClientError(error, "boundary", error.digest);
  }, [error]);

  return (
    <main className={`fade-up ${styles.page}`}>
      <section className={styles.card} role="alert" aria-labelledby="error-title">
        <span className={styles.icon} aria-hidden="true"><AlertTriangle size={26} /></span>
        <h1 id="error-title" className={styles.title}>{t("errorPage.title")}</h1>
        <p className={styles.body}>{t("errorPage.body")}</p>
        <div className={styles.actions}>
          <button type="button" className={`btn-primary ${styles.button}`} onClick={() => retry()}>
            <RotateCw size={15} aria-hidden="true" /> {t("errorPage.retry")}
          </button>
          <Link href="/" className={styles.link}>
            <ArrowLeft size={14} aria-hidden="true" /> {t("errorPage.home")}
          </Link>
        </div>
        {error.digest && (
          <p className={styles.reference}>
            {t("errorPage.reference")} <code>{error.digest}</code>
          </p>
        )}
      </section>
    </main>
  );
}
