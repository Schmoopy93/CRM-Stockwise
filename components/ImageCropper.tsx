"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, ZoomIn } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";

const OUT = 800; // output canvas size

interface Props {
  src: string;
  fileName: string;
  onCancel: () => void;
  onCropped: (file: File, previewUrl: string) => void;
}

export default function ImageCropper({ src, fileName, onCancel, onCropped }: Props) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const preRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [view, setView] = useState(320);
  const [base, setBase] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onCancel]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView(el.clientWidth));
    ro.observe(el);
    setView(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  function computeBase(img: HTMLImageElement, v: number) {
    if (!img.naturalWidth || !img.naturalHeight) return 0;
    const scale = Math.max(v / img.naturalWidth, v / img.naturalHeight);
    return Math.max(img.naturalWidth, img.naturalHeight) * scale;
  }

  function onImgLoad() {
    const img = preRef.current;
    if (!img) return;
    setBase(computeBase(img, view));
  }

  const clamp = useCallback((next: { x: number; y: number }, z: number) => {
    const half = Math.max(0, (base * z - view) / 2);
    return {
      x: Math.min(half, Math.max(-half, next.x)),
      y: Math.min(half, Math.max(-half, next.y)),
    };
  }, [base, view]);

  const shownOffset = base ? clamp(offset, zoom) : offset;

  function handleZoom(z: number) {
    const clamped = Math.min(4, Math.max(1, z));
    setZoom(clamped);
    setOffset((o) => clamp(o, clamped));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: shownOffset.x, oy: shownOffset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }, zoom));
  }
  function onPointerUp() { dragRef.current = null; }

  function confirm() {
    const img = imgRef.current;
    if (!img || !base) return;
    const size = base * zoom;
    const scale = OUT / view;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(
      img,
      (view / 2 - size / 2 + shownOffset.x) * scale,
      (view / 2 - size / 2 + shownOffset.y) * scale,
      size * scale,
      size * scale
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCropped(new File([blob], fileName.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }), URL.createObjectURL(blob));
    }, "image/jpeg", 0.9);
  }

  const size = base * zoom;

  return createPortal(
    <>
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
    >
      <div style={{ width: "100%", maxWidth: 380, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "1.25rem", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("cropper.title")}</p>
          <button onClick={onCancel} aria-label={t("back")} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)" }}>
            <X size={13} />
          </button>
        </div>

        <div
          ref={boxRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          style={{ position: "relative", width: "100%", height: view, borderRadius: 14, overflow: "hidden", background: "var(--bg-3)", touchAction: "none", cursor: "grab" }}
        >
          {base > 0 && (
            <img
              ref={imgRef}
              src={src} alt="" draggable={false}
              style={{
                position: "absolute", left: "50%", top: "50%",
                width: size, height: size,
                maxWidth: "none", maxHeight: "none",
                transform: `translate(calc(-50% + ${shownOffset.x}px), calc(-50% + ${shownOffset.y}px))`,
                userSelect: "none", pointerEvents: "none",
              }}
            />
          )}
          <div aria-hidden style={{ position: "absolute", inset: 0, border: "2px solid rgba(255,255,255,0.5)", borderRadius: 14, pointerEvents: "none" }} />
        </div>
        <p style={{ fontSize: "0.7rem", color: "var(--text-3)", margin: "0.6rem 0 0.75rem", textAlign: "center" }}>{t("cropper.hint")}</p>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.1rem" }}>
          <ZoomIn size={15} color="var(--text-3)" style={{ flexShrink: 0 }} />
          <input type="range" min={1} max={4} step={0.01} value={zoom}
            onChange={(e) => handleZoom(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent)" }} />
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "0.6rem", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 10, fontSize: "0.82rem", fontWeight: 600, color: "var(--text-2)", cursor: "pointer" }}>
            {t("back")}
          </button>
          <button onClick={confirm} disabled={!base} className="btn-primary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.82rem", padding: "0.6rem", opacity: base ? 1 : 0.5, cursor: base ? "pointer" : "wait" }}>
            <Check size={14} /> {t("cropper.confirm")}
          </button>
        </div>
      </div>
      </div>
      {/* hidden preloader drives base size + readiness */}
      <img src={src} alt="" ref={preRef} onLoad={onImgLoad} style={{ display: "none" }} />
    </>
    ,
    document.body
  );
}
