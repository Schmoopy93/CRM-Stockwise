"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { X, Camera } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader
      .decodeFromVideoDevice(null, videoRef.current!, (result, err) => {
        if (result) {
          onScan(result.getText());
          reader.reset();
        }
        if (err && !(err instanceof NotFoundException)) {
          setError(t("scan.cameraErrorDetail", { msg: err.message }));
        }
      })
      .catch((e: Error) => setError(t("scan.cameraUnavailableDetail", { msg: e.message })));

    return () => {
      reader.reset();
    };
  }, [onScan]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "100%", maxWidth: 480,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Camera size={16} color="var(--accent-2)" />
            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-1)" }}>{t("scan.title")}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Video */}
        <div style={{ position: "relative", background: "#000" }}>
          <video
            ref={videoRef}
            style={{ width: "100%", display: "block", maxHeight: 320, objectFit: "cover" }}
          />
          {/* Viewfinder overlay */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{
              width: 240, height: 80,
              border: "2px solid var(--accent-2)",
              borderRadius: 8,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            }} />
          </div>
        </div>

        {/* Status */}
        <div style={{ padding: "1rem 1.25rem", textAlign: "center" }}>
          {error ? (
            <p style={{ fontSize: "0.82rem", color: "var(--red)" }}>{error}</p>
          ) : (
            <p style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>
              {t("scan.hint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
