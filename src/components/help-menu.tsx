"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Help menu in the header toolbar. Provides:
 * - Re-trigger the onboarding tour
 * - Quick-reference wiki of how the app works
 * - Keyboard shortcut hint
 *
 * The dropdown and wiki modal are portaled to document.body so they
 * aren't clipped or repositioned by the header's flex layout.
 */

const WIKI_SECTIONS = [
  {
    title: "Tickets",
    body: "Tickets track a device from intake to return. Each ticket flows through states like Triage, Diagnosis, Repair, and Delivery. Drag tickets on the Kanban board or use bulk actions on the table view.",
  },
  {
    title: "Bench",
    body: "Your bench is your personal work queue — tickets assigned to you sorted oldest-first. Managers can view all benches to see who has what.",
  },
  {
    title: "Scheduling & Routes",
    body: "Create jobs from tickets that need pickup or delivery. Group jobs into a route, assign a driver, and the optimizer sequences the stops. Drivers see their route on the homepage with one-tap status buttons.",
  },
  {
    title: "SLA Tracking",
    body: "Each ticket state has an SLA threshold. Badges show green (on track), amber (warning), or red (breached). The manager dashboard surfaces all breached tickets.",
  },
  {
    title: "Quotes & Invoices",
    body: "When a repair is out of scope or over budget, create a quote and send it to the school contact. Approved quotes generate a PO. Invoice tracking ensures billing is complete before closing.",
  },
  {
    title: "Scanning",
    body: "Use the Scan page to scan device barcodes or QR codes. Warehouse scan-in auto-transitions pickup tickets to IN_WAREHOUSE.",
  },
  {
    title: "Time Tracking",
    body: "On each ticket, start and stop a timer to log your work. Minutes aggregate in the productivity dashboard.",
  },
  {
    title: "Keyboard Shortcuts",
    body: "Press ? anywhere to see all shortcuts. Press / to focus search. Use g + letter for quick navigation (g t = tickets, g b = bench, g s = scheduling).",
  },
];

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const [showWiki, setShowWiki] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close wiki on Escape
  useEffect(() => {
    if (!showWiki) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setShowWiki(false);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [showWiki]);

  function restartTour() {
    document.cookie =
      "bft_onboarding_done=; path=/; max-age=0; samesite=lax";
    setOpen(false);
    window.location.href = "/";
  }

  // Calculate dropdown position from button ref
  const btnRect = btnRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded border border-surface-border text-sm font-semibold text-slate-300 transition hover:border-accent hover:text-white"
        aria-label="Help and resources"
      >
        ?
      </button>

      {/* Dropdown menu — portaled to body */}
      {mounted && open && createPortal(
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-[61] w-56 rounded-lg border border-surface-border bg-surface-muted shadow-xl"
            style={{
              top: btnRect ? btnRect.bottom + 4 : 48,
              right: btnRect ? window.innerWidth - btnRect.right : 16,
            }}
          >
            <div className="border-b border-surface-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Help
              </span>
            </div>
            <ul className="py-1 text-sm">
              <li>
                <button
                  type="button"
                  onClick={restartTour}
                  className="w-full px-3 py-2 text-left text-slate-300 hover:bg-surface-border/40 hover:text-white"
                >
                  Restart tutorial
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setShowWiki(true);
                  }}
                  className="w-full px-3 py-2 text-left text-slate-300 hover:bg-surface-border/40 hover:text-white"
                >
                  How the app works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    // Small delay so the button blur doesn't interfere
                    // with the keyboard-shortcuts component
                    setTimeout(() => {
                      document.dispatchEvent(
                        new KeyboardEvent("keydown", {
                          key: "?",
                          bubbles: true,
                        }),
                      );
                    }, 50);
                  }}
                  className="w-full px-3 py-2 text-left text-slate-300 hover:bg-surface-border/40 hover:text-white"
                >
                  Keyboard shortcuts
                  <span className="ml-2 font-mono text-xs text-slate-500">
                    ?
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </>,
        document.body,
      )}

      {/* Wiki / how-it-works modal — portaled to body */}
      {mounted && showWiki && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur"
          onClick={() => setShowWiki(false)}
        >
          <div
            className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-surface-border bg-surface-muted p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">
                How BreakFix Triage works
              </h2>
              <button
                type="button"
                onClick={() => setShowWiki(false)}
                className="rounded border border-surface-border px-3 py-1 text-xs text-slate-300 hover:border-accent hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="space-y-5">
              {WIKI_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {section.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    {section.body}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-surface-border pt-4">
              <p className="text-xs text-slate-500">
                Need more help? Ask your team lead or check with your admin.
                Press{" "}
                <span className="font-mono text-accent">?</span> anywhere
                for keyboard shortcuts.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
