"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QrScanner } from "@/components/qr-scanner";

interface ScanHit {
  kind: "ticket" | "device" | "part" | "school";
  id: string;
  label: string;
  href: string;
}

/**
 * Client wrapper around the scanner. Posts the raw decoded string
 * to /api/scan and renders matching entities. On a single hit, the
 * user is auto-navigated; multiple hits get a picker.
 */
export function ScanClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [lastValue, setLastValue] = useState<string | null>(null);
  const [hits, setHits] = useState<ScanHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan(decoded: string) {
    setPending(true);
    setError(null);
    setLastValue(decoded);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: decoded }),
      });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const data = (await res.json()) as { hits: ScanHit[] };
      setHits(data.hits);
      if (data.hits.length === 1) {
        router.push(data.hits[0]!.href);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(false);
    }
  }

  // Round-9 §1B — manual entry fallback. Warehouse machines
  // sometimes deny camera permission or use USB barcode scanners
  // that emulate keyboard input. Operators type the code into
  // this input + Enter / click Go and it runs the same lookup
  // the camera scan would.
  const [manualValue, setManualValue] = useState("");

  return (
    <div className="space-y-6">
      <QrScanner onScan={handleScan} label="Camera viewfinder" />

      <form
        className="rounded-lg border border-surface-border bg-surface-muted/40 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = manualValue.trim();
          if (!v) return;
          handleScan(v);
        }}
      >
        <label className="mb-2 block text-xs text-slate-300">
          Or enter an asset tag, serial, or incident number
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="e.g. INC2200126, SN-1234, BX-101"
            className="flex-1 rounded border border-surface-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!manualValue.trim() || pending}
            className="rounded bg-accent px-3 py-2 text-sm font-semibold transition hover:bg-accent-strong disabled:opacity-50"
          >
            Go
          </button>
        </div>
      </form>

      {pending && (
        <div className="text-center text-sm text-slate-400">
          Looking up {lastValue}…
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {hits && hits.length === 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          No match for <span className="font-medium tracking-tight">{lastValue}</span>. Check
          that the label matches an incident number, device serial, asset
          tag, school code, or part SKU.
        </div>
      )}

      {hits && hits.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-300">
            Multiple matches for <span className="font-medium tracking-tight">{lastValue}</span>:
          </p>
          <ul className="space-y-2">
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <Link
                  href={hit.href}
                  className="flex items-center justify-between rounded border border-surface-border bg-surface px-3 py-2 text-sm hover:border-accent"
                >
                  <span className="font-medium">{hit.label}</span>
                  <span className="rounded bg-surface-border px-1.5 py-0.5 font-medium tracking-tight text-[10px] uppercase">
                    {hit.kind}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded border border-surface-border bg-surface-muted/40 px-3 py-2 text-xs text-slate-400">
        Tip: this scanner reads QR codes and standard 1D barcodes. Print
        labels with an asset tag, serial, or incident number on the
        device and the scan will jump straight to the right page.
      </div>
    </div>
  );
}
