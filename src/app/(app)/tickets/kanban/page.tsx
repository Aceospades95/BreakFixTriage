import Link from "next/link";
import { TicketState } from "@prisma/client";
import { AutoRefresh } from "@/components/auto-refresh";
import { KanbanBoard, type KanbanColumnDef } from "@/components/kanban-board";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Kanban board for tickets.
 *
 * Columns cover every active operational state. Drag a card to a
 * new column and the drag-drop handler calls the transition API,
 * which runs the change through the state machine guards. Illegal
 * transitions land an error toast and snap the card back.
 */
const COLUMNS: KanbanColumnDef[] = [
  { state: "TRIAGE", title: "Triage", hint: "Incoming, needs routing" },
  { state: "AWAITING_PICKUP", title: "Awaiting pickup", hint: "Ready to fetch" },
  { state: "IN_WAREHOUSE", title: "In warehouse", hint: "Arrived but not diagnosed" },
  { state: "DIAGNOSIS", title: "Diagnosis", hint: "On the bench" },
  { state: "AWAITING_PARTS", title: "Awaiting parts", hint: "Blocked" },
  { state: "IN_REPAIR", title: "In repair", hint: "Work in progress" },
  { state: "QUOTE_REQUIRED", title: "Quote required", hint: "OOW, draft a quote" },
  { state: "QUOTE_SENT", title: "Quote sent", hint: "Waiting on customer" },
  { state: "REPAIR_COMPLETED", title: "Repair completed", hint: "Ready to ship back" },
  { state: "PENDING_DELIVERY", title: "Pending delivery", hint: "Queued for a run" },
  { state: "INVOICE_REQUIRED", title: "Invoice required", hint: "Needs PO" },
];

export default async function KanbanPage() {
  await requireRole(PERMISSIONS.TICKETS_READ);

  const tickets = await prisma.ticket.findMany({
    where: { state: { in: COLUMNS.map((c) => c.state) } },
    orderBy: { stateEnteredAt: "asc" },
    include: {
      school: { select: { name: true, code: true } },
      device: { select: { serialNumber: true } },
      assignee: { select: { name: true } },
    },
    take: 1500,
  });

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
        subtitle={`${tickets.length} active tickets across ${COLUMNS.length} columns · drag cards between columns to transition`}
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
      <KanbanBoard columns={COLUMNS} tickets={boardTickets} />
    </>
  );
}
