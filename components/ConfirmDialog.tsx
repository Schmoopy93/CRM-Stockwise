"use client";

import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmDisabled?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.62)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.38)",
          padding: "1.25rem",
          animation: "fadeIn 0.16s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: destructive ? "rgba(239,68,68,0.1)" : "rgba(99,102,241,0.1)",
                border: destructive ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(99,102,241,0.25)",
              }}
            >
              <AlertTriangle size={18} color={destructive ? "var(--red)" : "var(--accent-2)"} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{title}</h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Zatvori"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-3)",
              color: "var(--text-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {description && (
          <p style={{ margin: "0.9rem 0 1.25rem", color: "var(--text-2)", fontSize: "0.88rem", lineHeight: 1.6 }}>
            {description}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: "1px solid var(--border)",
              background: "var(--bg-3)",
              color: "var(--text-1)",
              borderRadius: 10,
              padding: "0.65rem 1rem",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.82rem",
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={{
              border: "none",
              background: destructive ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #6366f1, #4f52d9)",
              color: "white",
              borderRadius: 10,
              padding: "0.65rem 1rem",
              cursor: confirmDisabled ? "not-allowed" : "pointer",
              opacity: confirmDisabled ? 0.6 : 1,
              fontWeight: 700,
              fontSize: "0.82rem",
              boxShadow: destructive ? "0 8px 24px rgba(239,68,68,0.28)" : "0 8px 24px rgba(99,102,241,0.28)",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
