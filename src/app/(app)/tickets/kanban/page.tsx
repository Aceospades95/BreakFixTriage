import Link from "next/link";
import { TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { SlaBadge } from "@/components/sla-badge";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * Kanban board for tickets.
 *
 * The ticket list is great for filtering, but dispatchers often want
 * to see "what's in each bucket" at a glance. Columns are the
 * operational active states — closed/hold/terminal quote states are
 * deliberately hidden to keep the board actionable.
 *
 * Ticket cards link to the detail page. Moving cards between columns
 * is a Phase 8 concern (needs drag-and-drop or per-card transition
 * buttons); today you click into a card to transition it.
 */
const COLUMNS: { state: TicketState; title: string; hint: string }[] = [
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

  const byState = new Map<TicketState, typeof tickets>();
  for (const col of COLUMNS) byState.set(col.state, []);
  for (const t of tickets) {
    const bucket = byState.get(t.state);
    if (bucket) bucket.push(t);
  }

  return (
    <>
      <PageHeader
        title="Kanban"
        subtitle={`${tickets.length} active tickets across ${COLUMNS.length} columns`}
        actions={
          <Link
            href="/tickets"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            Table view
          </Link>
        }
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTickets = byState.get(col.state) ?? [];
          return (
            <div
              key={col.state}
              className="flex min-w-[260px] max-w-[260px] shrink-0 flex-col rounded-lg border border-surface-border bg-surface-muted/40"
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
                      className="block rounded border border-surface-border bg-surface p-2 text-xs transition hover:border-accent"
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
                        <span>{t.school.name}</span>
                        {t.assignee && <span>→ {t.assignee.name}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
                {colTickets.length === 0 && (
                  <li className="text-center text-[11px] text-slate-500">
                    empty
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
