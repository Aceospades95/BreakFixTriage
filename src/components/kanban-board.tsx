"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TicketState } from "@prisma/client";
import { SlaBadge } from "@/components/sla-badge";
import { useAppEvents } from "@/components/use-app-events";
import { cn } from "@/lib/cn";

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

  useAppEvents(["tickets.changed", "tickets.bulk-changed"]);

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
      <div className="mb-4 flex items-center gap-2">
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
        <span className="ml-2 text-xs text-slate-500">
          {viewMode === "board" ? "Drag cards between columns to transition" : "Click a column to expand, drag cards in board view"}
        </span>
      </div>

      {viewMode === "grid" ? (
        /* Grid mode: responsive grid showing all columns at once */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {columns.map((col) => {
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
                <button
                  type="button"
                  onClick={() => toggleExpand(col.state)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      {col.title}
                    </div>
                    <div className="text-[10px] text-slate-500">{col.hint}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-surface-border px-2 py-0.5 font-mono text-xs">
                      {colTickets.length}
                    </span>
                    <span className="text-xs text-slate-500">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                  </div>
                </button>
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
                            <span className="font-mono text-accent">
                              {t.incidentNumber}
                            </span>
                            <SlaBadge ticket={t} compact />
                          </div>
                          <div className="mt-1 line-clamp-1 text-slate-300">
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
          {columns.map((col) => {
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
                <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      {col.title}
                    </div>
                    <div className="text-[10px] text-slate-500">{col.hint}</div>
                  </div>
                  <span className="rounded bg-surface-border px-2 py-0.5 font-mono text-xs">
                    {colTickets.length}
                  </span>
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
                          <span className="font-mono text-accent">
                            {t.incidentNumber}
                          </span>
                          <SlaBadge ticket={t} compact />
                        </div>
                        <div className="mt-1 line-clamp-2 text-slate-300">
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
