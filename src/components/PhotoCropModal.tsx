"use client";

import { useMemo, useRef, useState } from "react";

const CONTAINER_SIZE = 280;
const OUTPUT_SIZE = 480;

export default function PhotoCropModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Pas de revocation de l'URL objet ici : en mode strict (dev), React
  // double-invoque les effets et revoquerait l'URL avant meme que l'image
  // ait fini de charger. La fuite memoire est negligeable (une seule image,
  // duree de vie de la modale) ; le navigateur la liberera au dechargement.

  const coverScale = naturalSize ? Math.max(CONTAINER_SIZE / naturalSize.w, CONTAINER_SIZE / naturalSize.h) : 1;
  const totalScale = coverScale * zoom;
  const displayedW = naturalSize ? naturalSize.w * totalScale : CONTAINER_SIZE;
  const displayedH = naturalSize ? naturalSize.h * totalScale : CONTAINER_SIZE;

  function clampPan(px: number, py: number) {
    const minX = CONTAINER_SIZE - displayedW; // <= 0
    const minY = CONTAINER_SIZE - displayedH;
    return { x: Math.min(0, Math.max(minX, px)), y: Math.min(0, Math.max(minY, py)) };
  }

  const left = (CONTAINER_SIZE - displayedW) / 2 + pan.x;
  const top = (CONTAINER_SIZE - displayedH) / 2 + pan.y;

  function handlePointerDown(e: React.PointerEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan(clampPan(dragRef.current.panX + dx, dragRef.current.panY + dy));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleZoomChange(newZoom: number) {
    setZoom(newZoom);
    // Recalcule le pan pour rester dans les bornes avec le nouveau zoom.
    const newTotalScale = coverScale * newZoom;
    const newW = naturalSize ? naturalSize.w * newTotalScale : CONTAINER_SIZE;
    const newH = naturalSize ? naturalSize.h * newTotalScale : CONTAINER_SIZE;
    const minX = CONTAINER_SIZE - newW;
    const minY = CONTAINER_SIZE - newH;
    setPan((p) => ({ x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) }));
  }

  async function handleConfirm() {
    if (!imgRef.current || !naturalSize) return;
    setExporting(true);
    try {
      const sx = -left / totalScale;
      const sy = -top / totalScale;
      const sSize = CONTAINER_SIZE / totalScale;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas non supporte");
      ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) onConfirm(blob);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4">
        <h3 className="font-medium text-slate-900">Recadrer la photo</h3>
        <div
          className="mx-auto rounded-full overflow-hidden bg-slate-100 relative cursor-move touch-none"
          style={{ width: CONTAINER_SIZE, height: CONTAINER_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            style={{
              position: "absolute",
              left,
              top,
              width: displayedW,
              height: displayedH,
              maxWidth: "none",
            }}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-slate-400">Fais glisser l&apos;image pour la repositionner.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={exporting || !naturalSize}>
            {exporting ? "Traitement..." : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}
