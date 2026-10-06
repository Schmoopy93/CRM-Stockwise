"use client";

import { useRef, useState } from "react";
import ImageCropper from "@/components/ImageCropper";
import { MAX_PRODUCT_IMAGES } from "@/lib/actions";
import { useI18n } from "@/lib/i18n-context";
import { ImagePlus, Plus, Star, Trash2 } from "lucide-react";

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
    <section className="pform-card">
      <div className="pform-card-head">
        <span className="pform-card-icon"><ImagePlus size={15} /></span>
        <h2 className="pform-card-title">{t("product.image")}</h2>
        <span className="pform-card-count">{t("product.imageCount", { n: slots.length, max: MAX_PRODUCT_IMAGES })}</span>
      </div>
      <p className="pform-card-hint">{t("product.imagesHint")}</p>
      <div className="pform-images-grid">
        {slots.map((slot, i) => (
          <div key={`${slot.url}-${i}`} className="pform-image-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slot.url} alt={t("product.image")} />
            {i === 0 && (
              <span className="pform-image-badge">
                <Star size={9} /> {t("product.imageCover")}
              </span>
            )}
            <button type="button" onClick={() => removeSlot(i)} aria-label={t("product.imageRemove")} className="pform-image-remove">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {!full && (
          <button type="button" onClick={openPicker} className="pform-image-add">
            <Plus size={20} />
            <span>{t("product.imageAdd")}</span>
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
    </section>
  );
}
