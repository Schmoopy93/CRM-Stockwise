"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { deleteOwnAccount, deleteShopAccount } from "@/lib/actions";
import { useShop } from "@/lib/hooks";
import { translateError, useI18n } from "@/lib/i18n-context";

export default function DangerZone({ shopId }: { shopId: string }) {
  const { profile } = useAuth();
  const { t } = useI18n();
  const isOwner = profile?.role === "owner";
  const { name: shopName } = useShop(isOwner ? shopId : undefined);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!profile?.shopId) return null;

  const nameConfirmed = !isOwner || (shopName.trim().length > 0 && confirmText.trim() === shopName.trim());
  const hint = isOwner ? t("danger.confirmHint", { name: shopName }) : "";

  function close() {
    if (busy) return;
    setOpen(false);
    setConfirmText("");
    setError("");
  }

  async function run() {
    setError("");
    setBusy(true);
    try {
      if (isOwner) await deleteShopAccount();
      else await deleteOwnAccount();
      // The session ends with the account; the dashboard shell redirects out.
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code.endsWith("popup-closed-by-user") || code.endsWith("cancelled-popup-request")) {
        setBusy(false);
        setOpen(false);
        return;
      }
      setError(translateError(err, t, "danger.error"));
      setBusy(false);
    }
  }

  return (
    <section style={{ background: "var(--bg-2)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--red-dim)", color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertTriangle size={17} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("danger.title")}</p>
          <p style={{ fontSize: "0.72rem", lineHeight: 1.45, color: "var(--text-3)", margin: "0.15rem 0 0" }}>{isOwner ? t("danger.shopDesc") : t("danger.staffDesc")}</p>
        </div>
      </div>
      <div>
        <button
          type="button"
          onClick={() => { setConfirmText(""); setError(""); setOpen(true); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid rgba(239,68,68,0.35)", background: "var(--red-dim)", color: "var(--red)", borderRadius: 10, padding: "0.6rem 0.9rem", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem" }}
        >
          <Trash2 size={14} />
          {isOwner ? t("danger.deleteShop") : t("danger.deleteAccount")}
        </button>
      </div>

      <ConfirmDialog
        open={open}
        destructive
        title={isOwner ? t("danger.deleteShop") : t("danger.accountTitle")}
        confirmText={busy ? t("danger.deleting") : t("danger.confirmDelete")}
        cancelText={t("cancel")}
        confirmDisabled={busy || !nameConfirmed}
        onCancel={close}
        onConfirm={run}
        description={
          <>
            <span>{isOwner ? t("danger.shopDesc") : t("danger.staffDesc")}</span>
            {isOwner && (
              <span style={{ display: "block", marginTop: "0.8rem" }}>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder={hint}
                  aria-label={hint}
                  disabled={busy}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.75rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-1)", fontSize: "0.85rem" }}
                />
              </span>
            )}
            <span style={{ display: "block", marginTop: "0.8rem", fontSize: "0.78rem", color: "var(--text-3)" }}>{t("danger.reauthNote")}</span>
            {error && (
              <span role="alert" style={{ display: "block", marginTop: "0.65rem", fontSize: "0.78rem", color: "var(--red)", fontWeight: 650 }}>{error}</span>
            )}
          </>
        }
      />
    </section>
  );
}
