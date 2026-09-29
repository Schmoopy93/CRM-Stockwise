"use client";

import { useRef, useState } from "react";
import ImageCropper from "@/components/ImageCropper";
import { MAX_PRODUCT_IMAGES } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-context";
import { Plus, Trash2, Star } from "lucide-react";

export interface ProductImageSlot {
  file: File | null;
  url: string;
}

interface Props {
  slots: ProductImageSlot[];
  onChange: (slots: ProductImageSlot[]) => void;
}

export default function ProductImages({ slots, onChange }: Props) {
  const { t } = useI18n();
  const [cropSrc, setCropSrc] = useState("");
  const [cropFileName, setCropFileName] = useState("product.jpg");
  const fileRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    fileRef.current?.click();
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setCropFileName(f.name);
      setCropSrc(URL.createObjectURL(f));
    }
    e.target.value = "";
  }

  function removeSlot(i: number) {
    const slot = slots[i];
    if (slot.file) URL.revokeObjectURL(slot.url);
    onChange(slots.filter((_, idx) => idx !== i));
  }

  const full = slots.length >= MAX_PRODUCT_IMAGES;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("product.image")}</label>
        <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>{t("product.imageCount", { n: slots.length, max: MAX_PRODUCT_IMAGES })}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "0.6rem" }}>
        {slots.map((slot, i) => (
          <div key={`${slot.url}-${i}`} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: "var(--bg-3)", border: "1px solid var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slot.url} alt={t("product.image")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {i === 0 && (
              <span style={{ position: "absolute", top: 6, left: 6, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 99, fontSize: "0.62rem", fontWeight: 700, background: "color-mix(in srgb, var(--bg-2) 80%, transparent)", color: "var(--text-2)", border: "1px solid var(--border)", backdropFilter: "blur(6px)" }}>
                <Star size={9} /> {t("product.imageCover")}
              </span>
            )}
            <button type="button" onClick={() => removeSlot(i)} aria-label={t("product.imageRemove")}
              style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--bg-2) 85%, transparent)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--red)", backdropFilter: "blur(6px)" }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {!full && (
          <button type="button" onClick={openPicker}
            style={{ aspectRatio: "1 / 1", borderRadius: 12, border: "1px dashed var(--border-hover)", background: "var(--bg-3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", color: "var(--text-3)" }}>
            <Plus size={20} />
            <span style={{ fontSize: "0.68rem", fontWeight: 600 }}>{t("product.imageAdd")}</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPicked} />

      {cropSrc && (
        <ImageCropper src={cropSrc} fileName={cropFileName}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(""); }}
          onCropped={(file, url) => {
            URL.revokeObjectURL(cropSrc);
            onChange([...slots, { file, url }]);
            setCropSrc("");
          }}
        />
      )}
    </div>
  );
}
