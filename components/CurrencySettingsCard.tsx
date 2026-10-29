"use client";

import { useState } from "react";
import { useI18n, translateError, INTL_LOCALES } from "@/lib/i18n-context";
import { useExchangeRates, useShop } from "@/lib/hooks";
import { updateShopCurrency } from "@/lib/actions";
import { BASE_CURRENCY, hasRate, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { Coins } from "lucide-react";
import Select from "@/components/Select";
import styles from "./settings-card.module.css";

export default function CurrencySettingsCard({ shopId }: { shopId: string }) {
  const { t, locale } = useI18n();
  const { currency, loading } = useShop(shopId);
  const rates = useExchangeRates();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const selected = draft ?? currency;
  const dirty = draft !== null && draft !== currency;
  const rateMissing = !hasRate(selected, rates);

  async function save() {
    if (!draft) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      await updateShopCurrency(shopId, draft);
      setDraft(null);
      setSaved(true);
    } catch (cause) {
      setError(translateError(cause, t, "currency.error"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className={`glass ${styles.card}`}>
      <div className={styles.head}>
        <div className={styles.icon}>
          <Coins size={17} />
        </div>
        <div className={styles.headText}>
          <p className={styles.title}>{t("currency.title")}</p>
          <p className={styles.desc}>{t("currency.description")}</p>
        </div>
      </div>

      <div className={styles.actions}>
        <Select
          className={styles.inlineSelect}
          ariaLabel={t("currency.label")}
          value={selected}
          onChange={(next) => { setDraft(next); setSaved(false); }}
          options={SUPPORTED_CURRENCIES.map((option) => ({ value: option.code, label: `${option.code} — ${option.symbol}` }))}
        />
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="btn-primary"
        >
          {t("currency.save")}
        </button>
        {saved && <span className={styles.status} data-on="true">{t("currency.saved")}</span>}
      </div>

      <p className={styles.hint}>
        {selected === BASE_CURRENCY
          ? t("currency.baseNote")
          : rateMissing
            ? t("currency.rateMissing")
            : t("currency.rateNote", {
                rate: (rates.rates[selected] ?? 0).toLocaleString(locale, { maximumFractionDigits: 4 }),
                base: BASE_CURRENCY,
                currency: selected,
                date: rates.date ? new Date(rates.date).toLocaleDateString(INTL_LOCALES[locale]) : "—",
              })}
      </p>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
