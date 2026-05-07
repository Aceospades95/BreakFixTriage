"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TicketState } from "@prisma/client";
import { SlaBadge } from "@/components/sla-badge";
import { useAppEvents } from "@/components/use-app-events";
import { cn } from "@/lib/cn";

const HIDE_EMPTY_KEY = "kanban-hide-empty";

/**
 * Drag-and-drop kanban with a grid/board toggle.
 *
 * Board mode: classic horizontal scroll with drag-and-drop.
 * Grid mode: all columns visible at once in a responsive grid,
 * with expandable card lists. Better for seeing the full picture.
 */

export interface KanbanColumnDef {
  state: TicketState;
  title: string;
  hint: string;
}

export interface KanbanTicket {
  id: string;
  incidentNumber: string;
  state: TicketState;
  stateEnteredAt: Date | null;
  reportedAt: Date;
  shortDescription: string;
  schoolName: string;
  assigneeName: string | null;
}

export function KanbanBoard({
  columns,
  tickets,
}: {
  columns: KanbanColumnDef[];
  tickets: KanbanTicket[];
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "board">("grid");
  const [hideEmpty, setHideEmpty] = useState(false);

  useAppEvents(["tickets.changed", "tickets.bulk-changed"]);

  // Restore the "hide empty" preference from localStorage after mount.
  // We read on an effect (not during state init) so SSR/CSR markup
  // matches before hydration.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HIDE_EMPTY_KEY);
      if (saved === "1") setHideEmpty(true);
    } catch {
      /* localStorage may be disabled */
    }
  }, []);

  function toggleHideEmpty() {
    setHideEmpty((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HIDE_EMPTY_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TicketState | null>(null);
  const [optimistic, setOptimistic] = useState<Map<string, TicketState>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [expandedCols, setExpandedCols] = useState<Set<string>>(() => new Set());

  function effectiveState(t: KanbanTicket): TicketState {
    return optimistic.get(t.id) ?? t.state;
  }

  function toggleExpand(state: string) {
    setExpandedCols((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }

  function handleDragStart(e: React.DragEvent<HTMLAnchorElement>, id: string) {
    setDragging(id);
    setError(null);
    try {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    } catch {
      /* some browsers restrict */
    }
  }

  function handleDragEnd() {
    setDragging(null);
    setDropTarget(null);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, state: TicketState) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== state) setDropTarget(state);
  }

  async function handleDrop(
    e: React.DragEvent<HTMLDivElement>,
    target: TicketState,
  ) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragging;
    setDragging(null);
    setDropTarget(null);
    if (!id) return;

    setOptimistic((prev) => {
      const next = new Map(prev);
      next.set(id, target);
      return next;
    });

    try {
      const res = await fetch(`/api/tickets/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: target,
          reason: `Kanban drag from kanban board`,
          source: "kanban",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Transition failed (${res.status})`);
      }
      router.refresh();
      setTimeout(() => {
        setOptimistic((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }, 1500);
    } catch (err) {
      setOptimistic((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setError(err instanceof Error ? err.message : "Transition failed");
    }
  }

  const byState = new Map<TicketState, KanbanTicket[]>();
  for (const col of columns) byState.set(col.state, []);
  for (const t of tickets) {
    const state = effectiveState(t);
    const bucket = byState.get(state);
    if (bucket) bucket.push(t);
  }

  // When "hide empty" is on, drop columns with no tickets. We keep a
  // column that's the current drop target so a drag isn't cut off
  // mid-gesture just because it was empty to start with.
  const visibleColumns = hideEmpty
    ? columns.filter(
        (c) =>
          (byState.get(c.state)?.length ?? 0) > 0 || dropTarget === c.state,
      )
    : columns;
  const hiddenCount = columns.length - visibleColumns.length;

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {/* View toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setViewMode("grid")}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            viewMode === "grid"
              ? "bg-accent text-white"
              : "border border-surface-border text-slate-300 hover:border-accent hover:text-white",
          )}
        >
          Grid view
        </button>
        <button
          type="button"
          onClick={() => setViewMode("board")}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            viewMode === "board"
              ? "bg-accent text-white"
              : "border border-surface-border text-slate-300 hover:border-accent hover:text-white",
          )}
        >
          Board view
        </button>
        <label
          className={cn(
            "ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition",
            hideEmpty
              ? "border-primary bg-primary/10 text-primary"
              : "border-surface-border text-slate-300 hover:border-accent hover:text-white",
          )}
          title="Hide columns with zero tickets"
        >
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={toggleHideEmpty}
            className="h-3 w-3 accent-primary"
          />
          Only with tickets
          {hideEmpty && hiddenCount > 0 && (
            <span className="ml-1 rounded bg-primary/20 px-1 py-0.5 text-[10px] tabular-nums">
              {hiddenCount} hidden
            </span>
          )}
        </label>
        <span className="ml-2 text-xs text-slate-500">
          {viewMode === "board" ? "Drag cards between columns to transition" : "Click a column to expand, drag cards in board view"}
        </span>
      </div>

      {visibleColumns.length === 0 ? (
        <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-8 text-center text-sm text-slate-400">
          No tickets in any kanban column right now.
          <button
            type="button"
            onClick={toggleHideEmpty}
            className="ml-2 underline hover:text-primary"
          >
            Show all columns
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid mode: responsive grid showing all columns at once */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleColumns.map((col) => {
            const colTickets = byState.get(col.state) ?? [];
            const isExpanded = expandedCols.has(col.state);
            const showCount = isExpanded ? 20 : 3;
            return (
              <div
                key={col.state}
                onDragOver={(e) => handleDragOver(e, col.state)}
                onDrop={(e) => handleDrop(e, col.state)}
                onDragLeave={() => {
                  if (dropTarget === col.state) setDropTarget(null);
                }}
                className={cn(
                  "rounded-lg border transition",
                  dropTarget === col.state
                    ? "border-accent ring-2 ring-accent/60 bg-accent/10"
                    : "border-surface-border bg-surface-muted/40",
                )}
              >
                <div className="flex w-full items-stretch">
                  <Link
                    href={`/tickets?state=${col.state}`}
                    title={`Open ${col.title} in table view`}
                    className="flex flex-1 items-center justify-between px-3 py-2.5 text-left transition hover:bg-muted/40"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-100 hover:text-primary">
                        {col.title}
                      </div>
                      <div className="text-[10px] text-slate-500">{col.hint}</div>
                    </div>
                    <span className="inline-block min-w-[3ch] whitespace-nowrap rounded bg-muted px-2 py-0.5 text-center text-xs tabular-nums">
                      {colTickets.length}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleExpand(col.state)}
                    title={isExpanded ? "Collapse" : "Expand"}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                    className="flex items-center justify-center border-l border-border/40 px-2 text-slate-500 transition hover:bg-muted hover:text-primary"
                  >
                    <span className="text-xs">{isExpanded ? "▼" : "▶"}</span>
                  </button>
                </div>
                {colTickets.length > 0 && (
                  <ul className="space-y-1.5 border-t border-surface-border/50 p-2">
                    {colTickets.slice(0, showCount).map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/tickets/${t.id}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, t.id)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "block rounded border border-surface-border bg-surface p-2 text-xs transition hover:border-accent",
                            dragging === t.id ? "opacity-40" : "",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium tracking-tight text-accent">
                              {t.incidentNumber}
                            </span>
                            <SlaBadge ticket={t} compact />
                          </div>
                          <div
                            className="mt-1 line-clamp-1 text-slate-300"
                            title={t.shortDescription}
                          >
                            {t.shortDescription}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                            <span>{t.schoolName}</span>
                            {t.assigneeName && <span>{t.assigneeName}</span>}
                          </div>
                        </Link>
                      </li>
                    ))}
                    {colTickets.length > showCount && (
                      <li>
                        <button
                          type="button"
                          onClick={() => toggleExpand(col.state)}
                          className="w-full rounded px-2 py-1 text-center text-[10px] text-slate-500 hover:text-accent"
                        >
                          {isExpanded
                            ? "show less"
                            : `+${colTickets.length - showCount} more`}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Board mode: classic horizontal scroll */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {visibleColumns.map((col) => {
            const colTickets = byState.get(col.state) ?? [];
            const isOver = dropTarget === col.state;
            return (
              <div
                key={col.state}
                onDragOver={(e) => handleDragOver(e, col.state)}
                onDrop={(e) => handleDrop(e, col.state)}
                onDragLeave={() => {
                  if (dropTarget === col.state) setDropTarget(null);
                }}
                className={cn(
                  "flex min-w-[260px] max-w-[260px] shrink-0 flex-col rounded-lg border bg-surface-muted/40 transition",
                  isOver
                    ? "border-accent ring-2 ring-accent/60 bg-accent/10"
                    : "border-surface-border",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/tickets?state=${col.state}`}
                      className="block text-sm font-semibold text-slate-100 hover:text-primary"
                      title={`Open ${col.title} in table view`}
                    >
                      {col.title}
                    </Link>
                    <div className="text-[10px] text-slate-500">{col.hint}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block min-w-[3ch] whitespace-nowrap rounded bg-muted px-2 py-0.5 text-center text-xs tabular-nums">
                      {colTickets.length}
                    </span>
                    <Link
                      href={`/tickets?state=${col.state}`}
                      className="text-slate-500 hover:text-primary"
                      title={`Open ${col.title} in table view`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </Link>
                  </div>
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto p-2">
                  {colTickets.slice(0, 40).map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/tickets/${t.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "block cursor-grab rounded border border-surface-border bg-surface p-2 text-xs transition active:cursor-grabbing hover:border-accent",
                          dragging === t.id ? "opacity-40" : "",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium tracking-tight text-accent">
                            {t.incidentNumber}
                          </span>
                          <SlaBadge ticket={t} compact />
                        </div>
                        <div
                          className="mt-1 line-clamp-2 text-slate-300"
                          title={t.shortDescription}
                        >
                          {t.shortDescription}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span>{t.schoolName}</span>
                          {t.assigneeName && <span>→ {t.assigneeName}</span>}
                        </div>
                      </Link>
                    </li>
                  ))}
                  {colTickets.length === 0 && (
                    <li className="text-center text-[11px] text-slate-500">
                      {isOver ? "drop to transition" : "empty"}
                    </li>
                  )}
                  {colTickets.length > 40 && (
                    <li className="text-center text-[10px] text-slate-500">
                      …and {colTickets.length - 40} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
