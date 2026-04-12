"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";

/**
 * Help menu in the header toolbar. Provides:
 * - Re-trigger the onboarding tour
 * - Quick-reference wiki of how the app works
 * - Keyboard shortcut hint
 *
 * Uses a client-side dropdown so we can clear the onboarding cookie
 * and toggle the wiki panel without navigation.
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

export function HelpMenu({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [showWiki, setShowWiki] = useState(false);

  function restartTour() {
    // Clear the onboarding cookie so the tour shows again on next page load
    document.cookie =
      "bft_onboarding_done=; path=/; max-age=0; samesite=lax";
    setOpen(false);
    // Reload so the server component sees the cleared cookie
    window.location.href = "/";
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded border border-transparent px-2 py-1 text-sm text-slate-300 transition hover:border-surface-border hover:text-white"
          aria-label="Help and resources"
        >
          <span className="text-base" aria-hidden="true">?</span>
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-surface-border bg-surface-muted shadow-xl">
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
                      // Trigger keyboard shortcut overlay via synthetic keydown
                      document.dispatchEvent(
                        new KeyboardEvent("keydown", { key: "?" }),
                      );
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
          </>
        )}
      </div>

      {/* Wiki / how-it-works panel */}
      {showWiki && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
          onClick={() => setShowWiki(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-surface-border bg-surface-muted p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">
                How BreakFix Triage works
              </h2>
              <button
                type="button"
                onClick={() => setShowWiki(false)}
                className="rounded border border-surface-border px-2 py-0.5 text-xs hover:border-accent"
              >
                close
              </button>
            </div>
            <div className="space-y-4">
              {WIKI_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {section.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {section.body}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-surface-border pt-4">
              <p className="text-xs text-slate-500">
                Need more help? Ask your team lead or check with your admin.
                You can also press{" "}
                <span className="font-mono text-accent">?</span> anywhere
                for keyboard shortcuts.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
