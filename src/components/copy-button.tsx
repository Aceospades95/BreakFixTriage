"use client";

import { useState } from "react";

/**
 * Round-18 — clipboard copy button for one-shot secrets (portal
 * magic links). Falls back to a manual-selection hint when the
 * Clipboard API is unavailable (non-HTTPS LAN deployments).
 */
export function CopyButton({
  value,
  label = "Copy link",
}: {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      data-testid="copy-button"
      className="rounded border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25"
    >
      {state === "copied"
        ? "Copied ✓"
        : state === "failed"
          ? "Select & copy manually"
          : label}
    </button>
  );
}
