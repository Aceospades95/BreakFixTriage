"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TicketState } from "@prisma/client";
import { SlaBadge } from "@/components/sla-badge";
import { useAppEvents } from "@/components/use-app-events";
import { cn } from "@/lib/cn";

/**
 * Drag-and-drop kanban.
 *
 * Uses the HTML5 drag-and-drop API so nothing has to be added to
 * the bundle. Each card is draggable; columns are drop zones. On
 * drop, we POST to `/api/tickets/[id]/transition` with the target
 * state. The server action validates the transition through the
 * existing state machine, so an illegal drop gets a toast and the
 * board reverts to the server state.
 *
 * Optimistic UI: the card moves into the target column the instant
 * a drop lands, then we call `router.refresh()` to re-sync with
 * the server. If the server rejected the transition, the refresh
 * snaps the card back.
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

  // Live push: any time a ticket changes on the server (someone
  // else dragged, a bulk action ran, etc.) we refresh the server
  // component feeding this board.
  useAppEvents(["tickets.changed", "tickets.bulk-changed"]);

  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TicketState | null>(null);
  const [optimistic, setOptimistic] = useState<Map<string, TicketState>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);

  function effectiveState(t: KanbanTicket): TicketState {
    return optimistic.get(t.id) ?? t.state;
  }

  function handleDragStart(e: React.DragEvent<HTMLAnchorElement>, id: string) {
    setDragging(id);
    setError(null);
    try {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    } catch {
      /* some browsers restrict; optional */
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

    // Optimistic move
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
      // Server accepted. Ask Next to re-run the server component so
      // the board reflects the new ticket state from the DB.
      router.refresh();
      // Clear the optimistic entry after a moment so the refresh
      // doesn't race with our state.
      setTimeout(() => {
        setOptimistic((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }, 1500);
    } catch (err) {
      // Revert the optimistic move and surface the error.
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
              aria-label={`${col.title} column, drop tickets here to transition`}
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
    </>
  );
}
