"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { translateError, useI18n } from "@/lib/i18n-context";
import { saveCustomer } from "@/lib/actions";
import { MAX_CUSTOMER_TAGS, MAX_TAG_LENGTH, parseTags, type CustomerInput } from "@/lib/customers";
import type { Customer } from "@/lib/types";
import { Check, Loader2, X } from "lucide-react";

interface Props {
  shopId: string;
  /** Omit to create. Passed to edit an existing record in place. */
  customer?: Customer | null;
  onSaved: (customerId: string) => void;
  onClose: () => void;
}

const FIELD: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.7rem",
  fontSize: "0.85rem",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--text-3)",
  marginBottom: 4,
};

/** Create and edit are the same form — a customer is only ever created from
 * empty, never duplicated into a new record by editing an old one, so keeping
 * them in one component means a field can never exist on one path and not the
 * other. */
export default function CustomerForm({ shopId, customer, onSaved, onClose }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(customer?.name ?? "");
  const [contact, setContact] = useState(customer?.contact ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [note, setNote] = useState(customer?.note ?? "");
  const [tags, setTags] = useState(customer?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Only the accepted tags are previewed, so what is offered for removal is
  // exactly what will be stored — including the truncation to the tag cap.
  const parsedTags = parseTags(tags);
  const tagOverflow = tags.split(",").map((part) => part.trim()).filter(Boolean).length > MAX_CUSTOMER_TAGS;

  async function submit() {
    setError(""); setSaving(true);
    const input: CustomerInput = { name, contact, email, note, tags };
    try {
      onSaved(await saveCustomer(shopId, customer?.id ?? null, input));
    } catch (cause) {
      setError(translateError(cause, t, "customers.saveError"));
      setSaving(false);
    }
  }

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (!saving) submit(); }}
        style={{ width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.9rem", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "1.25rem", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
            {customer ? t("customers.editTitle") : t("customers.newTitle")}
          </p>
          <button type="button" onClick={onClose} aria-label={t("back")} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)" }}>
            <X size={13} />
          </button>
        </div>

        <div>
          <label htmlFor="customer-name" style={LABEL}>{t("customers.name")}</label>
          <input
            id="customer-name"
            className="input"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("customers.namePlaceholder")}
            style={FIELD}
          />
        </div>

        <div>
          <label htmlFor="customer-contact" style={LABEL}>{t("customers.contact")}</label>
          <input
            id="customer-contact"
            className="input"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t("customers.contactPlaceholder")}
            style={FIELD}
          />
          <p style={{ fontSize: "0.68rem", color: "var(--text-3)", margin: "4px 0 0" }}>{t("customers.contactHint")}</p>
        </div>

        <div>
          <label htmlFor="customer-email" style={LABEL}>{t("customers.email")} · {t("product.optional")}</label>
          <input
            id="customer-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@example.com"
            style={FIELD}
          />
        </div>

        <div>
          <label htmlFor="customer-tags" style={LABEL}>{t("customers.tags")}</label>
          <input
            id="customer-tags"
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t("customers.tagsPlaceholder")}
            style={FIELD}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            {parsedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTags(parsedTags.filter((other) => other !== tag).join(", "))}
                title={t("customers.removeTag")}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "0.15rem 0.5rem", fontSize: "0.68rem", fontWeight: 600, background: "var(--accent-glow)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 99, color: "var(--accent-2)", cursor: "pointer" }}
              >
                {tag}
                <X size={9} />
              </button>
            ))}
            {parsedTags.length === 0 && <span style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>{t("customers.tagsHint", { max: MAX_TAG_LENGTH, count: MAX_CUSTOMER_TAGS })}</span>}
          </div>
          {tagOverflow && <p style={{ fontSize: "0.68rem", color: "var(--amber)", margin: "4px 0 0" }}>{t("customers.tagsCapped", { count: MAX_CUSTOMER_TAGS })}</p>}
        </div>

        <div>
          <label htmlFor="customer-note" style={LABEL}>{t("customers.note")} · {t("product.optional")}</label>
          <textarea
            id="customer-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("customers.notePlaceholder")}
            style={{ ...FIELD, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        {error && <p style={{ fontSize: "0.8rem", color: "var(--red)", margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving} style={{ padding: "0.45rem 0.9rem", fontSize: "0.8rem" }}>{t("cancel")}</button>
          <button type="submit" className="btn-primary" disabled={saving || !name.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0.45rem 0.9rem", fontSize: "0.8rem" }}>
            {saving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
            {saving ? t("loading") : t("save")}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
