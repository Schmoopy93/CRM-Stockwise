"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import ImageCropper from "@/components/ImageCropper";
import { setCatalogImage } from "@/lib/actions";
import { translateError, useI18n } from "@/lib/i18n-context";
import { ChevronDown, ChevronUp, ImagePlus, RefreshCw, Trash2 } from "lucide-react";

type BrandingKind = "logo" | "cover";

const CROP: Record<BrandingKind, { aspect: number; outputWidth: number }> = {
  logo: { aspect: 1, outputWidth: 512 },
  cover: { aspect: 3, outputWidth: 1800 },
};

const iconButton = {
  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
  background: "color-mix(in srgb, var(--bg-2) 85%, transparent)", border: "1px solid var(--border)",
  borderRadius: 8, cursor: "pointer", backdropFilter: "blur(6px)",
} as const;

export default function CatalogBrandingFields({ shopId, logoUrl, coverUrl }: { shopId: string; logoUrl: string; coverUrl: string }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef<BrandingKind>("logo");
  const [crop, setCrop] = useState<{ kind: BrandingKind; src: string; name: string } | null>(null);
  const [busy, setBusy] = useState<BrandingKind | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  function pick(kind: BrandingKind) {
    pickingRef.current = kind;
    fileRef.current?.click();
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCrop({ kind: pickingRef.current, src: URL.createObjectURL(file), name: file.name });
    e.target.value = "";
  }

  async function save(kind: BrandingKind, file: File | null) {
    setError(""); setBusy(kind);
    try {
      await setCatalogImage(shopId, kind, file);
    } catch (err: unknown) {
      setError(translateError(err, t, "catalog.error"));
    } finally { setBusy(null); }
  }

  function renderSlot(kind: BrandingKind, url: string) {
    const label = t(kind === "logo" ? "catalog.logo" : "catalog.cover");
    return (
      <div style={{ position: "relative", flexShrink: 0, width: kind === "logo" ? 84 : undefined, flex: kind === "cover" ? "1 1 220px" : undefined, aspectRatio: `${CROP[kind].aspect} / 1`, borderRadius: kind === "logo" ? 18 : 14, overflow: "hidden", background: "var(--bg-3)", border: url ? "1px solid var(--border)" : "1px dashed var(--border-hover)" }}>
        {url ? (
          <>
            <Image src={url} alt={label} fill sizes={kind === "logo" ? "84px" : "(max-width: 760px) 100vw, 1000px"} quality={90} style={{ objectFit: "cover" }} />
            <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
              <button type="button" onClick={() => pick(kind)} disabled={busy !== null} aria-label={`${t("catalog.imageReplace")} — ${label}`} style={{ ...iconButton, color: "var(--text-1)" }}>
                <RefreshCw size={12} />
              </button>
              <button type="button" onClick={() => save(kind, null)} disabled={busy !== null} aria-label={`${t("catalog.remove")} — ${label}`} style={{ ...iconButton, color: "var(--red)" }}>
                <Trash2 size={12} />
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => pick(kind)} disabled={busy !== null}
            style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}>
            <ImagePlus size={18} />
            <span style={{ fontSize: "0.68rem", fontWeight: 600 }}>{label}</span>
          </button>
        )}
        {busy === kind && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--bg-2) 70%, transparent)" }}>
            <div className="spinner" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start", padding: 0, background: "transparent", border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-2)" }}>
        {t("catalog.brandingTitle")}
        {open ? <ChevronUp size={14} style={{ color: "var(--text-3)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-3)" }} />}
      </button>
      {open && (
        <>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            {renderSlot("logo", logoUrl)}
            {renderSlot("cover", coverUrl)}
          </div>
          <p style={{ fontSize: "0.72rem", color: "var(--text-3)", margin: 0 }}>{t("catalog.brandingHint")}</p>
        </>
      )}
      {error && <p style={{ fontSize: "0.78rem", color: "var(--red)", margin: 0 }}>{error}</p>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPicked} />

      {crop && (
        <ImageCropper src={crop.src} fileName={`${crop.kind}-${crop.name}`} aspect={CROP[crop.kind].aspect} outputWidth={CROP[crop.kind].outputWidth} fitMode="contain"
          onCancel={() => { URL.revokeObjectURL(crop.src); setCrop(null); }}
          onCropped={(file, previewUrl) => {
            URL.revokeObjectURL(previewUrl);
            URL.revokeObjectURL(crop.src);
            setCrop(null);
            save(crop.kind, file);
          }}
        />
      )}
    </div>
  );
}
