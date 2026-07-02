"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PopoverMenu, usePopoverClose } from "@/components/popover-menu";
import { GUIDE_SECTIONS } from "@/lib/help/content";

/**
 * Help menu in the header toolbar.
 *
 * Closes findings §3.A5: dropdown now closes on outside click,
 * Escape, route change, and another popover opening — all via the
 * shared PopoverMenu primitive. The "How the app works" wiki is
 * still rendered as a separate portaled modal that the menu
 * triggers; only the dropdown changed.
 */



export function HelpMenu() {
  const [showWiki, setShowWiki] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close wiki on Escape (independent of popover dismissal — the
  // wiki is a separate modal layer).
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

  return (
    <>
      <PopoverMenu
        panelClassName="w-56"
        trigger={
          <button
            type="button"
            aria-label="Help and resources"
            className="flex h-8 w-8 items-center justify-center rounded border border-surface-border text-sm font-semibold text-slate-300 transition hover:border-accent hover:text-white"
          >
            ?
          </button>
        }
      >
        <div className="border-b border-surface-border px-3 py-2">
          <span className="text-xs font-semibold tracking-wide text-slate-200">
            Help
          </span>
        </div>
        <ul className="py-1 text-sm">
          <li>
            <HelpCenterLink />
          </li>
          <li>
            <RestartTourButton />
          </li>
          <li>
            <OpenWikiButton onOpen={() => setShowWiki(true)} />
          </li>
          <li>
            <ShortcutsButton />
          </li>
        </ul>
      </PopoverMenu>

      {/* Wiki / how-it-works modal — portaled to body, kept as its
          own layer because it's a modal, not a dropdown. */}
      {mounted && showWiki &&
        createPortal(
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
                {GUIDE_SECTIONS.map((section) => (
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
                  <span className="font-medium tracking-tight text-accent">?</span> anywhere
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

function HelpCenterLink() {
  const close = usePopoverClose();
  return (
    <Link
      href="/help"
      onClick={close}
      className="block w-full px-3 py-2 text-left font-medium text-accent hover:bg-surface-border/40"
    >
      Open help center →
    </Link>
  );
}

function RestartTourButton() {
  const close = usePopoverClose();
  return (
    <button
      type="button"
      onClick={() => {
        close();
        document.cookie =
          "bft_onboarding_done=; path=/; max-age=0; samesite=lax";
        window.location.href = "/";
      }}
      className="w-full px-3 py-2 text-left text-slate-300 hover:bg-surface-border/40 hover:text-white"
    >
      Restart tutorial
    </button>
  );
}

function OpenWikiButton({ onOpen }: { onOpen: () => void }) {
  const close = usePopoverClose();
  return (
    <button
      type="button"
      onClick={() => {
        close();
        onOpen();
      }}
      className="w-full px-3 py-2 text-left text-slate-300 hover:bg-surface-border/40 hover:text-white"
    >
      How the app works
    </button>
  );
}

function ShortcutsButton() {
  const close = usePopoverClose();
  return (
    <button
      type="button"
      onClick={() => {
        close();
        // Small delay so the button blur doesn't interfere with the
        // keyboard-shortcuts component's `?` listener.
        setTimeout(() => {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "?", bubbles: true }),
          );
        }, 50);
      }}
      className="flex w-full items-center justify-between px-3 py-2 text-left text-slate-300 hover:bg-surface-border/40 hover:text-white"
    >
      <span>Keyboard shortcuts</span>
      <span className="font-medium tracking-tight text-xs text-slate-500">?</span>
    </button>
  );
}
