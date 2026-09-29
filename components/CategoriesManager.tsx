"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n-context";
import { renameCategory } from "@/lib/actions";
import { Pencil, X, Check } from "lucide-react";

interface Props {
  shopId: string;
  categories: string[];
  onRenamed: (oldName: string, newName: string) => void;
  onClose: () => void;
}

export default function CategoriesManager({ shopId, categories, onRenamed, onClose }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function submit(oldName: string) {
    setError(""); setSaving(true);
    try {
      await renameCategory(shopId, oldName, value);
      onRenamed(oldName, value);
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("categories.error"));
    } finally { setSaving(false); }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
    >
      <div style={{ width: "100%", maxWidth: 400, maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "1.25rem", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("categories.manage")}</p>
          <button onClick={onClose} aria-label={t("back")} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)" }}>
            <X size={13} />
          </button>
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {categories.length === 0 && <p style={{ fontSize: "0.82rem", color: "var(--text-3)", textAlign: "center", margin: "1rem 0" }}>{t("categories.empty")}</p>}
          {categories.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.55rem 0.75rem" }}>
              {editing === cat ? (
                <>
                  <input
                    autoFocus
                    className="input"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !saving) submit(cat); if (e.key === "Escape") setEditing(null); }}
                    style={{ flex: 1, padding: "0.35rem 0.6rem", fontSize: "0.82rem" }}
                    aria-label={t("categories.newName")}
                  />
                  <button onClick={() => submit(cat)} disabled={saving} className="btn-primary" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, cursor: saving ? "wait" : "pointer" }} aria-label={t("categories.save")}>
                    <Check size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                  <button
                    onClick={() => { setEditing(cat); setValue(cat); setError(""); }}
                    aria-label={t("categories.rename")}
                    style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)", flexShrink: 0 }}
                  >
                    <Pencil size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {error && <p style={{ fontSize: "0.8rem", color: "var(--red)", margin: "0.75rem 0 0" }}>{error}</p>}
        <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "0.75rem 0 0", textAlign: "center" }}>{t("categories.hint")}</p>
      </div>
    </div>,
    document.body
  );
}
