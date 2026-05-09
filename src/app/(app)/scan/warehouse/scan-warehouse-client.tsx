"use client";

import { useRef, useState } from "react";
import { QrScanner } from "@/components/qr-scanner";
import { scanInDeviceAction } from "@/server/actions/warehouse";

/**
 * Warehouse scan-in UI.
 *
 * The scanner feeds decoded strings into a hidden form that calls
 * `scanInDeviceAction`. That action finds any awaiting-pickup
 * ticket for the device and transitions it to IN_WAREHOUSE in one
 * shot. This removes the "scan → navigate → click transition"
 * friction on the warehouse door so a cart of 12 devices moves
 * through in under a minute.
 *
 * We deliberately use a hidden <form>-submit approach (rather than
 * fetch) so the server-side flash message lands as a toast via
 * the existing ToastHost component.
 */
export function ScanWarehouseClient() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);

  function handleScan(decoded: string) {
    setLastScan(decoded);
    if (!formRef.current || !inputRef.current) return;
    inputRef.current.value = decoded;
    // Submit immediately — the server action does the work and
    // redirects back here with a summary toast.
    formRef.current.requestSubmit();
  }

  return (
    <div className="space-y-4">
      <QrScanner
        onScan={handleScan}
        label="Scan device serial or asset tag to receive into warehouse"
      />

      <form
        ref={formRef}
        action={scanInDeviceAction}
        className="flex flex-wrap items-center gap-2 rounded border border-surface-border bg-surface-muted/40 p-3 text-sm"
      >
        <label className="flex flex-1 items-center gap-2">
          Manual entry:
          <input
            type="text"
            name="serial"
            ref={inputRef}
            placeholder="e.g. SN-0001 / AT-0001"
            className="flex-1 rounded border border-surface-border bg-surface px-2 py-1 font-medium tracking-tight text-xs focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
        >
          Receive
        </button>
      </form>

      {lastScan && (
        <div className="rounded border border-surface-border bg-surface-muted/40 px-3 py-2 text-xs text-slate-400">
          Last scan: <span className="font-medium tracking-tight">{lastScan}</span>
        </div>
      )}

      <div className="rounded border border-surface-border bg-surface-muted/40 px-3 py-2 text-xs text-slate-400">
        {/* Round-3 §G29: state names rendered humanised, not as
            ALL_CAPS_UNDERSCORE. Round-3 §G14: dropped font-medium tracking-tight. */}
        Tip: point the camera at a device barcode or QR label. The action
        finds every open ticket on that device in{" "}
        <strong className="font-medium text-slate-300">Awaiting pickup</strong> /
        {" "}
        <strong className="font-medium text-slate-300">Pickup scheduled</strong>
        {" "}and moves it to{" "}
        <strong className="font-medium text-slate-300">In warehouse</strong>{" "}
        automatically.
      </div>
    </div>
  );
}
