"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, ZoomIn } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  src: string;
  fileName: string;
  aspect?: number;
  outputWidth?: number;
  fitMode?: "cover" | "contain";
  onCancel: () => void;
  onCropped: (file: File, previewUrl: string) => void;
}

export default function ImageCropper({ src, fileName, aspect = 1, outputWidth = 1600, fitMode = "cover", onCancel, onCropped }: Props) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const preRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [view, setView] = useState(320);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
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

  const viewHeight = view / aspect;
  const ready = natural.w > 0 && natural.h > 0;
  const coverFit = ready ? Math.max(view / natural.w, viewHeight / natural.h) : 0;
  const fit = ready && fitMode === "contain" ? Math.min(view / natural.w, viewHeight / natural.h) : coverFit;
  const maxZoom = ready ? (4 * coverFit) / fit : 4;

  function onImgLoad() {
    const img = preRef.current;
    if (!img) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }

  const clamp = useCallback((next: { x: number; y: number }, z: number) => {
    const halfX = Math.max(0, (natural.w * fit * z - view) / 2);
    const halfY = Math.max(0, (natural.h * fit * z - viewHeight) / 2);
    return {
      x: Math.min(halfX, Math.max(-halfX, next.x)),
      y: Math.min(halfY, Math.max(-halfY, next.y)),
    };
  }, [natural, fit, view, viewHeight]);

  const shownOffset = ready ? clamp(offset, zoom) : offset;

  function handleZoom(z: number) {
    const clamped = Math.min(maxZoom, Math.max(1, z));
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
    if (!img || !ready) return;
    const outWidth = Math.round(Math.min(outputWidth, view / (fit * zoom)));
    const outHeight = Math.round(outWidth / aspect);
    const scale = outWidth / view;
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const filled = width >= view - 0.5 && height >= viewHeight - 0.5;
    const type = filled ? "image/jpeg" : "image/png";
    if (filled) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outWidth, outHeight);
    }
    ctx.drawImage(
      img,
      (view / 2 - width / 2 + shownOffset.x) * scale,
      (viewHeight / 2 - height / 2 + shownOffset.y) * scale,
      width * scale,
      height * scale
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCropped(new File([blob], fileName.replace(/\.[^.]+$/, "") + (filled ? ".jpg" : ".png"), { type }), URL.createObjectURL(blob));
    }, type, 0.9);
  }

  const width = natural.w * fit * zoom;
  const height = natural.h * fit * zoom;

  return createPortal(
    <>
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
    >
      <div style={{ width: "100%", maxWidth: aspect > 1 ? 560 : 380, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "1.25rem", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{t("cropper.title")}</p>
          <button onClick={onCancel} aria-label={t("back")} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)" }}>
            <X size={13} />
          </button>
        </div>

        <div
          ref={boxRef}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          style={{ position: "relative", width: "100%", height: viewHeight, borderRadius: 14, overflow: "hidden", background: "var(--bg-3)", touchAction: "none", cursor: "grab" }}
        >
          {ready && (
            <img
              ref={imgRef}
              src={src} alt="" draggable={false}
              style={{
                position: "absolute", left: "50%", top: "50%",
                width, height,
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
          <input type="range" min={1} max={maxZoom} step={0.01} value={zoom}
            onChange={(e) => handleZoom(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent)" }} />
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "0.6rem", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 10, fontSize: "0.82rem", fontWeight: 600, color: "var(--text-2)", cursor: "pointer" }}>
            {t("back")}
          </button>
          <button onClick={confirm} disabled={!ready} className="btn-primary" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.82rem", padding: "0.6rem", opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "wait" }}>
            <Check size={14} /> {t("cropper.confirm")}
          </button>
        </div>
      </div>
      </div>
      {/* hidden preloader drives natural size + readiness */}
      <img src={src} alt="" ref={preRef} onLoad={onImgLoad} style={{ display: "none" }} />
    </>
    ,
    document.body
  );
}
