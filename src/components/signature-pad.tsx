"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Canvas signature pad.
 *
 * Captures a pointer-drawn signature and stores it as a base64
 * PNG in a hidden form field. The parent form posts the field as
 * part of its FormData — no extra wiring required.
 *
 * Mobile-friendly: pointer events so finger, stylus, and mouse
 * all work identically. Canvas resizes to its container on mount
 * and on window resize.
 */
export function SignaturePad({
  name = "signature",
  label = "Signature",
}: {
  name?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Resize canvas to its parent width on mount. Height is fixed.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const width = parent.clientWidth;
      const height = 180;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#f1f5f9";
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = point(e);
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    const last = lastRef.current;
    if (!p || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasInk) setHasInk(true);
  }

  function commit() {
    // Snapshot the canvas into the hidden input so the next form
    // submit picks it up. Called on pointer up so the value is
    // always fresh by the time the Submit button is pressed.
    const canvas = canvasRef.current;
    const hidden = hiddenRef.current;
    if (!canvas || !hidden) return;
    hidden.value = canvas.toDataURL("image/png");
  }

  function handleUp() {
    drawingRef.current = false;
    lastRef.current = null;
    commit();
  }

  function clear() {
    const canvas = canvasRef.current;
    const hidden = hiddenRef.current;
    if (!canvas || !hidden) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.scale(dpr, dpr);
    hidden.value = "";
    setHasInk(false);
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <div className="rounded-lg border border-surface-border bg-surface">
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={handleUp}
          className="block w-full touch-none cursor-crosshair rounded-lg"
          aria-label="Signature canvas"
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {hasInk ? "Signed" : "Sign above with your finger or stylus"}
        </span>
        <button
          type="button"
          onClick={clear}
          className="rounded border border-surface-border px-2 py-0.5 text-xs hover:border-accent"
        >
          Clear
        </button>
      </div>
      <input type="hidden" name={name} ref={hiddenRef} defaultValue="" />
    </div>
  );
}
