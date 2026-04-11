"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * QR + barcode scanner wrapper.
 *
 * Wraps `html5-qrcode` in a React component that:
 *   - lazy-imports the library on mount so first-page loads don't
 *     pay for it
 *   - picks a back-camera ("environment") by default on phones
 *   - debounces successful scans so a single read doesn't fire the
 *     callback ten times per second
 *   - exposes an error state for permission denials and
 *     unsupported browsers
 *
 * The consumer controls what happens after a scan via the
 * `onScan` callback — the scanner itself has no opinion about
 * navigation, so the same component works for "open a ticket"
 * (scan page) and "pick a part to consume" (parts panel).
 */

interface Html5QrcodeLike {
  start(
    cameraIdOrConstraints: { facingMode: string } | string,
    config: { fps: number; qrbox?: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError?: (err: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

export function QrScanner({
  onScan,
  autoStart = true,
  label = "Scan a code",
}: {
  onScan: (decoded: string) => void;
  autoStart?: boolean;
  label?: string;
}) {
  const containerId = "qr-scanner-container";
  const scannerRef = useRef<Html5QrcodeLike | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">(
    autoStart ? "starting" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStatus("starting");
    setError(null);
    try {
      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode as unknown as new (
        elementId: string,
      ) => Html5QrcodeLike;
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText: string) => {
          // Debounce: ignore the same value within 1.5 s so a stable
          // read doesn't fire the callback over and over.
          const now = Date.now();
          const last = lastScanRef.current;
          if (last && last.value === decodedText && now - last.at < 1500) {
            return;
          }
          lastScanRef.current = { value: decodedText, at: now };
          onScan(decodedText);
        },
      );
      setStatus("scanning");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Camera unavailable");
    }
  }

  async function stop() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      /* ignore */
    }
    scannerRef.current = null;
    setStatus("idle");
  }

  useEffect(() => {
    if (autoStart) {
      void start();
    }
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div
        id={containerId}
        className={cn(
          "mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-surface-border bg-black",
          status === "scanning" ? "ring-2 ring-accent/60" : "",
        )}
        aria-label={label}
      />
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {status === "scanning" && "Ready — hold a code steady in the frame"}
          {status === "starting" && "Starting camera…"}
          {status === "idle" && "Camera stopped"}
          {status === "error" && error}
        </span>
        <div className="flex gap-2">
          {status === "idle" && (
            <button
              type="button"
              onClick={() => {
                void start();
              }}
              className="rounded border border-surface-border px-2 py-0.5 text-xs hover:border-accent"
            >
              Start
            </button>
          )}
          {status === "scanning" && (
            <button
              type="button"
              onClick={() => {
                void stop();
              }}
              className="rounded border border-surface-border px-2 py-0.5 text-xs hover:border-accent"
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
