"use client";

import { useState } from "react";
import { translateError, useI18n } from "@/lib/i18n-context";
import { useCustomers } from "@/lib/hooks";
import { saveCustomer } from "@/lib/actions";
import { customerMatches } from "@/lib/customers";
import { UserPlus, X } from "lucide-react";

interface Props {
  shopId: string;
  value: string;
  onChange: (customerId: string) => void;
}

/** Attribution picker used wherever a shop records who something was for.
 *
 * A sale already carries a buyer name typed at the till, and a catalog order
 * already carries whatever the visitor typed. This does not replace either: it
 * attaches the record to a customer so the shop can find all of one person's
 * activity later. That is why it is optional everywhere it appears — requiring
 * a customer would mean a walk-in with no record could not be sold to.
 *
 * The customer can be picked from the list or created on the spot, because the
 * moment a name is learned is when it is worth writing down. */
export default function CustomerPicker({ shopId, value, onChange }: Props) {
  const { t } = useI18n();
  const { customers } = useCustomers(shopId);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");

  const selected = customers.find((customer) => customer.id === value);
  const matches = search.trim()
    ? customers.filter((customer) => customerMatches(customer, search)).slice(0, 8)
    : customers.slice(0, 8);

  async function create(name: string) {
    setError("");
    try {
      onChange(await saveCustomer(shopId, null, { name }));
      setFormOpen(false);
      setSearch("");
    } catch (cause) {
      setError(translateError(cause, t, "customers.saveError"));
    }
  }

  // A linked record shows as a chip, so it is obvious the sale or order is
  // attributed to someone and can be undone with one click. An unlinked one
  // opens straight into the list.
  if (selected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "0.25rem 0.6rem", fontSize: "0.78rem", fontWeight: 600, background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 99, color: "var(--accent-2)" }}>
          {selected.name}
          <button type="button" onClick={() => onChange("")} aria-label={t("customers.unlink")} style={{ display: "flex", padding: 0, background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}>
            <X size={11} />
          </button>
        </span>
        {error && <span style={{ fontSize: "0.72rem", color: "var(--red)" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <select
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("customers.pick")}
          style={{ flex: 1, minWidth: 0 }}
        >
          <option value="">{t("customers.pickNone")}</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}{customer.contact ? ` · ${customer.contact}` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={() => setFormOpen((open) => !open)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "0.4rem 0.7rem", fontSize: "0.78rem", flexShrink: 0 }}>
          <UserPlus size={13} />
          {t("customers.quickAdd")}
        </button>
      </div>

      {formOpen && (
        <>
          <input
            className="input"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            aria-label={t("customers.searchPlaceholder")}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto" }}>
            {matches.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => { onChange(customer.id); setSearch(""); }}
                style={{ textAlign: "start", padding: "0.35rem 0.55rem", fontSize: "0.78rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-1)", cursor: "pointer" }}
              >
                {customer.name}
                {customer.contact && <span style={{ color: "var(--text-3)" }}> · {customer.contact}</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => create(search)}
            disabled={!search.trim()}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, padding: "0.3rem 0.6rem", fontSize: "0.75rem", background: "transparent", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--accent-2)", cursor: search.trim() ? "pointer" : "default", opacity: search.trim() ? 1 : 0.5 }}
          >
            <UserPlus size={12} />
            {t("customers.createNamed", { name: search.trim() })}
          </button>
        </>
      )}

      {error && <span style={{ fontSize: "0.72rem", color: "var(--red)" }}>{error}</span>}
    </div>
  );
}

/** Inline variant for a list row, where the full picker would not fit: it links
 * an existing order to a customer without a dialog, and detaches with one click. */
export function CustomerLinkChip({ shopId, value, onChange }: Props) {
  const { t } = useI18n();
  const { customers } = useCustomers(shopId);
  const selected = customers.find((customer) => customer.id === value);

  if (!selected) {
    return (
      <select
        className="input"
        value=""
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("customers.attach")}
        style={{ width: "auto", maxWidth: 160, padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
      >
        <option value="">{t("customers.attach")}</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}{customer.contact ? ` · ${customer.contact}` : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "0.15rem 0.5rem", fontSize: "0.7rem", fontWeight: 600, background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 99, color: "var(--accent-2)" }}>
      {selected.name}
      <button type="button" onClick={() => onChange("")} aria-label={t("customers.unlink")} style={{ display: "flex", padding: 0, background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}>
        <X size={10} />
      </button>
    </span>
  );
}
