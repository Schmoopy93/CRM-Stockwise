"use client";

import { useState } from "react";
import { useI18n, translateError } from "@/lib/i18n-context";
import { useExchangeRates, useShop } from "@/lib/hooks";
import { updateShopCurrency } from "@/lib/actions";
import { BASE_CURRENCY, hasRate, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { Coins } from "lucide-react";

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
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-glow)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Coins size={17} color="var(--accent-2)" />
        </div>
        <div>
          <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("currency.title")}</p>
          <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("currency.description")}</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="input"
          aria-label={t("currency.label")}
          value={selected}
          onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
          style={{ maxWidth: 260 }}
        >
          {SUPPORTED_CURRENCIES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.code} — {option.symbol}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="btn-primary"
          style={{ fontSize: "0.78rem", opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? "default" : "pointer" }}
        >
          {t("currency.save")}
        </button>
        {saved && <span style={{ fontSize: "0.75rem", color: "var(--green)", fontWeight: 600 }}>{t("currency.saved")}</span>}
      </div>

      <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>
        {selected === BASE_CURRENCY
          ? t("currency.baseNote")
          : rateMissing
            ? t("currency.rateMissing")
            : t("currency.rateNote", {
                rate: (rates.rates[selected] ?? 0).toLocaleString(locale, { maximumFractionDigits: 4 }),
                base: BASE_CURRENCY,
                currency: selected,
                date: rates.date,
              })}
      </p>

      {error && <p style={{ fontSize: "0.78rem", color: "var(--red)", margin: 0 }}>{error}</p>}
    </div>
  );
}
