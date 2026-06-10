"use client";

import { createContext, useContext, useState } from "react";

/**
 * Round-18 §3 — one-stop-at-a-time accordion for the route detail
 * page.
 *
 * Field feedback: rendering every stop fully expanded buried the
 * stop a technician is actually working. The accordion keeps the
 * whole route visible as compact summary rows and expands exactly
 * one stop at a time. The server page passes both the summary row
 * and the detail body as JSX children (serializable across the
 * server→client boundary — same pattern as TicketsBulkActions),
 * so all the server-action forms inside keep working untouched.
 *
 * `defaultOpenId` is the first actionable stop: after a stop is
 * completed the page re-renders and the next active stop opens
 * itself — the "what do I do next" question answers itself.
 */

const AccordionCtx = createContext<{
  openId: string | null;
  toggle: (id: string) => void;
} | null>(null);

export function StopAccordion({
  defaultOpenId,
  children,
}: {
  defaultOpenId: string | null;
  children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  return (
    <AccordionCtx.Provider value={{ openId, toggle }}>
      <ol className="space-y-3">{children}</ol>
    </AccordionCtx.Provider>
  );
}

export function StopAccordionItem({
  stopId,
  header,
  children,
}: {
  stopId: string;
  /** Always-visible summary row. Must not contain interactive elements. */
  header: React.ReactNode;
  /** Expanded detail body — forms, device lists, photo capture, etc. */
  children: React.ReactNode;
}) {
  const ctx = useContext(AccordionCtx);
  const open = ctx?.openId === stopId;
  return (
    <li
      data-testid="route-stop"
      data-stop-id={stopId}
      data-open={open ? "true" : "false"}
      className={`rounded-lg border bg-surface-muted/60 transition ${
        open ? "border-accent/60" : "border-surface-border"
      }`}
    >
      <button
        type="button"
        onClick={() => ctx?.toggle(stopId)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left hover:bg-surface-muted"
      >
        <div className="min-w-0 flex-1">{header}</div>
        <span
          aria-hidden
          className={`shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open && <div className="border-t border-surface-border p-4 pt-3">{children}</div>}
    </li>
  );
}
