import Link from "next/link";
import { TicketState } from "@prisma/client";
import { AutoRefresh } from "@/components/auto-refresh";
import { KanbanBoard, type KanbanColumnDef } from "@/components/kanban-board";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { andTicketWhere, ticketWhereForSession } from "@/lib/data/forSession";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { readStatusConfig } from "@/lib/workflow/status-config";

export const dynamic = "force-dynamic";

/**
 * Kanban board for tickets.
 *
 * Columns are built dynamically from the admin Status Management
 * config so renames / disables / new-slots propagate here without
 * a code change. We still filter down to the operationally useful
 * states (no CLOSED, no REOPENED, no ON_HOLD, no IMPORTED) so the
 * board stays focused on in-flight work.
 *
 * Drag a card to a new column and the drag-drop handler calls the
 * transition API, which runs the change through the state machine
 * guards. Illegal transitions land an error toast and snap the
 * card back.
 */

/** Default labels/hints used when the admin hasn't overridden them. */
const DEFAULT_LABELS: Partial<Record<TicketState, { title: string; hint: string }>> = {
  // IMPORTED is included as a column (interim fix for findings §2#2):
  // a fresh ServiceNow import lands ~250 tickets in IMPORTED, and
  // hiding the column made the board lie ("4 active across 22
  // columns" while 248 tickets sat invisible). The auto-promote
  // IMPORTED → TRIAGE on creation decision is part of the §4 status
  // taxonomy ADR (docs/adr/0005-...) and must not be made
  // unilaterally.
  IMPORTED: { title: "Imported", hint: "Fresh from ServiceNow — needs triage" },
  TRIAGE: { title: "Triage", hint: "Incoming, needs routing" },
  AWAITING_PICKUP: { title: "Awaiting pickup", hint: "Ready to fetch" },
  PICKUP_SCHEDULED: { title: "Pickup scheduled", hint: "On a route" },
  IN_WAREHOUSE: { title: "In warehouse", hint: "Arrived but not diagnosed" },
  DIAGNOSIS: { title: "Diagnosis", hint: "On the bench" },
  AWAITING_PARTS: { title: "Awaiting parts", hint: "Blocked" },
  PARTS_ORDERED: { title: "Parts ordered", hint: "ETA tracked" },
  IN_REPAIR: { title: "In repair", hint: "Work in progress" },
  REPAIR_COMPLETED: { title: "Repair completed", hint: "Ready to ship back" },
  AWAITING_ONSITE: { title: "Awaiting onsite", hint: "Field visit pending" },
  ONSITE_IN_PROGRESS: { title: "Onsite in progress", hint: "Tech on site" },
  QUOTE_REQUIRED: { title: "Quote required", hint: "OOW, draft a quote" },
  QUOTE_SENT: { title: "Quote sent", hint: "Waiting on customer" },
  QUOTE_APPROVED: { title: "Quote approved", hint: "Ready to work" },
  QUOTE_DECLINED: { title: "Quote declined", hint: "Return as-is" },
  QUOTE_NO_RESPONSE: { title: "Quote no response", hint: "Follow up" },
  MANUFACTURER_RMA: { title: "Manufacturer RMA", hint: "Sent to vendor" },
  OUT_OF_SCOPE: { title: "Out of scope", hint: "Not covered" },
  PENDING_DELIVERY: { title: "Pending delivery", hint: "Queued for a run" },
  DELIVERY_SCHEDULED: { title: "Delivery scheduled", hint: "On a return route" },
  RETURNED: { title: "Returned", hint: "Back with customer" },
  INVOICE_REQUIRED: { title: "Invoice required", hint: "Needs PO" },
  // Round-9 §1D — Closed column at the right edge. Same header
  // treatment + count badge + "+N more" pagination as the other
  // columns. The "Only with tickets" toggle hides it when empty.
  CLOSED: { title: "Closed", hint: "Done — left here as a record" },
};

/** States that should never appear as kanban columns. */
const KANBAN_EXCLUDED: readonly TicketState[] = [
  // IMPORTED + CLOSED stay as columns; CLOSED was excluded before
  // Round-9 §1D promoted it to a terminal-state column.
  "REOPENED",
  "ON_HOLD",
];

export default async function KanbanPage() {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  // Five-borough expansion — the board was unscoped, so a
  // district-scoped user saw every borough's cards.
  const scope = ticketWhereForSession(session);

  const config = await readStatusConfig();

  // Build columns from enabled, non-excluded states. Preserve the order in
  // DEFAULT_LABELS (which roughly follows the lifecycle) and apply admin
  // label overrides.
  const orderedStates = Object.keys(DEFAULT_LABELS) as TicketState[];
  const columns: KanbanColumnDef[] = orderedStates
    .filter(
      (s) =>
        !KANBAN_EXCLUDED.includes(s) && !config.disabled.includes(s),
    )
    .map((s) => {
      const defaults = DEFAULT_LABELS[s]!;
      const overrideLabel = config.labels?.[s];
      return {
        state: s,
        title: overrideLabel ?? defaults.title,
        hint: defaults.hint,
      };
    });

  // Round-9 §1D — Closed tickets join the board, but they're
  // ordered most-recent-first (closedAt desc) and capped at 100
  // so the historical tail doesn't dominate the query budget.
  // In-flight columns keep the oldest-first (stateEnteredAt asc)
  // ordering so SLA-aging cards bubble to the top.
  const inFlightStates = columns
    .map((c) => c.state)
    .filter((s) => s !== "CLOSED");
  const wantClosed = columns.some((c) => c.state === "CLOSED");

  // True per-state totals. The board renders a capped slice, so
  // without these every column badge reports the slice length —
  // citywide that pins the badges at the cap and the board silently
  // stops reflecting the backlog.
  const [inFlightTickets, closedTickets, stateGroups] = await Promise.all([
    prisma.ticket.findMany({
      where: andTicketWhere(scope, { state: { in: inFlightStates } }),
      orderBy: { stateEnteredAt: "asc" },
      include: {
        school: { select: { name: true, code: true } },
        device: { select: { serialNumber: true } },
        assignee: { select: { name: true } },
      },
      take: 1500,
    }),
    wantClosed
      ? prisma.ticket.findMany({
          where: andTicketWhere(scope, { state: "CLOSED" }),
          orderBy: { closedAt: "desc" },
          include: {
            school: { select: { name: true, code: true } },
            device: { select: { serialNumber: true } },
            assignee: { select: { name: true } },
          },
          take: 100,
        })
      : Promise.resolve([]),
    prisma.ticket.groupBy({
      by: ["state"],
      where: andTicketWhere(scope, {
        state: { in: columns.map((c) => c.state) },
      }),
      _count: { _all: true },
    }),
  ]);
  const tickets = [...inFlightTickets, ...closedTickets];
  const stateCounts: Record<string, number> = Object.fromEntries(
    stateGroups.map((g) => [g.state, g._count._all]),
  );
  const boardTotal = stateGroups.reduce((a, g) => a + g._count._all, 0);

  const boardTickets = tickets.map((t) => ({
    id: t.id,
    incidentNumber: t.incidentNumber,
    state: t.state as TicketState,
    stateEnteredAt: t.stateEnteredAt,
    reportedAt: t.reportedAt,
    shortDescription: t.shortDescription,
    schoolName: t.school.name,
    assigneeName: t.assignee?.name ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Kanban"
        subtitle={`${boardTotal.toLocaleString()} tickets across ${columns.length} columns${boardTotal > tickets.length ? ` · showing the ${tickets.length} most urgent` : ""} · drag cards between columns to transition`}
        actions={
          <div className="flex items-center gap-3">
            <AutoRefresh storageKey="kanban-auto-refresh" intervalSeconds={30} />
            <Link
              href="/tickets"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Table view
            </Link>
          </div>
        }
      />
      <KanbanBoard
        columns={columns}
        tickets={boardTickets}
        stateCounts={stateCounts}
      />
    </>
  );
}
