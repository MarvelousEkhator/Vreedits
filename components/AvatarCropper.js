"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { Check, X, ImageOff, Loader2 } from "lucide-react";

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = 480;

export default function AvatarCropper({ imageSrc, onCancel, onSave }) {
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef(null);

  useEffect(() => {
    setNaturalSize(null);
    setLoadError(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    if (!imageSrc || typeof imageSrc !== "string" || !imageSrc.startsWith("data:image/")) {
      // If this ever fires, whatever called AvatarCropper handed it something
      // that isn't actual image data (e.g. the wrong variable, an empty
      // string, a non-image data URL). Surfacing it here — rather than
      // silently trying to render it — is what makes a bad caller visible.
      console.warn("AvatarCropper received a non-image imageSrc:", imageSrc);
      setLoadError(true);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setLoadError(true);
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const baseScale = naturalSize
    ? Math.max(PREVIEW_SIZE / naturalSize.w, PREVIEW_SIZE / naturalSize.h)
    : 1;
  const effectiveScale = baseScale * zoom;

  function handlePointerDown(e) {
    if (!naturalSize) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, origin: { ...offset } };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset({ x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy });
  }
  function handlePointerUp() {
    dragState.current = null;
  }

  const handleSave = useCallback(() => {
    if (!naturalSize || loadError) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    const outputScaleFactor = OUTPUT_SIZE / PREVIEW_SIZE;

    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.translate(
      OUTPUT_SIZE / 2 + offset.x * outputScaleFactor,
      OUTPUT_SIZE / 2 + offset.y * outputScaleFactor
    );
    ctx.scale(effectiveScale * outputScaleFactor, effectiveScale * outputScaleFactor);
    ctx.drawImage(imgRef.current, -naturalSize.w / 2, -naturalSize.h / 2);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onSave(dataUrl);
  }, [naturalSize, loadError, offset, effectiveScale, onSave]);

  const ready = !!naturalSize && !loadError;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 360, padding: 22 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Drag to reposition
          </h2>
          <button onClick={onCancel} style={{ color: "var(--text-muted)", background: "none", border: "none" }} aria-label="Cancel">
            <X size={18} />
          </button>
        </div>

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: "50%",
            overflow: "hidden", margin: "0 auto 20px", position: "relative",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            cursor: ready ? "grab" : "default", touchAction: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {loadError && (
            <div className="flex flex-col items-center gap-2" style={{ color: "var(--text-muted)" }}>
              <ImageOff size={28} />
              <span className="text-xs" style={{ maxWidth: 180, textAlign: "center" }}>
                Couldn't load that image. Try picking it again.
              </span>
            </div>
          )}
          {!loadError && !naturalSize && (
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          )}
          {ready && (
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              draggable={false}
              style={{
                position: "absolute", left: "50%", top: "50%",
                width: naturalSize.w, height: naturalSize.h,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${effectiveScale})`,
                transformOrigin: "center center",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <input
          type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          disabled={!ready}
          style={{ width: "100%", marginBottom: 20, opacity: ready ? 1 : 0.5 }}
          aria-label="Zoom"
        />

        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-primary" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary" disabled={!ready}>
            <Check size={15} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
