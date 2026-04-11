import Link from "next/link";
import { TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SlaBadge } from "@/components/sla-badge";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import {
  daysInState,
  slaHealth,
} from "@/lib/reports/sla";

export const dynamic = "force-dynamic";

/**
 * Tech bench view.
 *
 * Two modes controlled by the `scope` query param:
 *   - `me` (default): only tickets assigned to the current user
 *   - `all`: every assignee grouped as separate columns (manager view)
 *
 * For individual techs this is their home page: an actionable list
 * of their work, oldest-first with SLA badges, already filtered to
 * states they typically care about (triage, warehouse, repair,
 * onsite).
 */
export default async function BenchPage({
  searchParams,
}: {
  searchParams?: { scope?: string };
}) {
  const session = await requireRole(PERMISSIONS.TICKETS_READ);
  const canSeeAll =
    can(session.role, PERMISSIONS.TICKETS_WRITE) ||
    session.role === "OPS_MANAGER" ||
    session.role === "ADMIN";
  const scope = canSeeAll && searchParams?.scope === "all" ? "all" : "me";

  const activeStates: TicketState[] = [
    "TRIAGE",
    "IN_WAREHOUSE",
    "DIAGNOSIS",
    "AWAITING_PARTS",
    "PARTS_ORDERED",
    "IN_REPAIR",
    "REPAIR_COMPLETED",
    "AWAITING_ONSITE",
    "ONSITE_IN_PROGRESS",
    "QUOTE_REQUIRED",
    "QUOTE_SENT",
  ];

  if (scope === "me") {
    const tickets = await prisma.ticket.findMany({
      where: {
        assignedUserId: session.userId,
        state: { in: activeStates },
      },
      orderBy: { stateEnteredAt: "asc" },
      include: {
        school: { select: { name: true } },
        device: { select: { serialNumber: true } },
      },
      take: 200,
    });

    const breachedCount = tickets.filter((t) => {
      const days = daysInState(t, new Date());
      return slaHealth(t.state, days) === "breached";
    }).length;

    return (
      <>
        <PageHeader
          title="My bench"
          subtitle={`${tickets.length} active ticket${tickets.length === 1 ? "" : "s"}${breachedCount > 0 ? ` · ${breachedCount} past SLA` : ""}`}
          actions={
            canSeeAll && (
              <Link
                href="/bench?scope=all"
                className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
              >
                All benches →
              </Link>
            )
          }
        />

        {tickets.length === 0 ? (
          <EmptyBench />
        ) : (
          <TicketList tickets={tickets} />
        )}
      </>
    );
  }

  // All benches (manager view).
  const [byAssignee, unassigned] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["assignedUserId"],
      where: {
        state: { in: activeStates },
        assignedUserId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.ticket.findMany({
      where: { state: { in: activeStates }, assignedUserId: null },
      orderBy: { stateEnteredAt: "asc" },
      include: {
        school: { select: { name: true } },
        device: { select: { serialNumber: true } },
      },
      take: 100,
    }),
  ]);

  const assigneeIds = byAssignee
    .map((r) => r.assignedUserId)
    .filter((id): id is string => id != null);
  const [users, ticketsByUser] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true, role: true },
    }),
    prisma.ticket.findMany({
      where: {
        assignedUserId: { in: assigneeIds },
        state: { in: activeStates },
      },
      orderBy: { stateEnteredAt: "asc" },
      include: {
        school: { select: { name: true } },
        device: { select: { serialNumber: true } },
      },
    }),
  ]);

  const byUser = new Map<string, typeof ticketsByUser>();
  for (const t of ticketsByUser) {
    if (!t.assignedUserId) continue;
    const bucket = byUser.get(t.assignedUserId) ?? [];
    bucket.push(t);
    byUser.set(t.assignedUserId, bucket);
  }

  return (
    <>
      <PageHeader
        title="All benches"
        subtitle="Every active ticket grouped by assignee"
        actions={
          <Link
            href="/bench?scope=me"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ← My bench
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {users.map((u) => {
          const tickets = byUser.get(u.id) ?? [];
          return (
            <section
              key={u.id}
              className="rounded-lg border border-surface-border bg-surface-muted p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{u.name}</div>
                  <div className="text-[10px] font-mono uppercase text-slate-500">
                    {u.role}
                  </div>
                </div>
                <span className="rounded bg-surface-border px-2 py-0.5 font-mono text-xs">
                  {tickets.length}
                </span>
              </div>
              {tickets.length === 0 ? (
                <p className="text-xs text-slate-400">empty</p>
              ) : (
                <CompactTicketList tickets={tickets} />
              )}
            </section>
          );
        })}
        <section className="rounded-lg border border-surface-border bg-surface-muted p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Unassigned</div>
              <div className="text-[10px] font-mono uppercase text-slate-500">
                no owner
              </div>
            </div>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-xs text-amber-200">
              {unassigned.length}
            </span>
          </div>
          {unassigned.length === 0 ? (
            <p className="text-xs text-slate-400">empty</p>
          ) : (
            <CompactTicketList tickets={unassigned} />
          )}
        </section>
      </div>
    </>
  );
}

function EmptyBench() {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-10 text-center text-sm text-slate-400">
      Nothing assigned to you right now. Ask a dispatcher to route some
      work your way, or drop by the{" "}
      <Link href="/tickets?state=TRIAGE" className="text-accent hover:underline">
        triage queue
      </Link>
      .
    </div>
  );
}

function TicketList({
  tickets,
}: {
  tickets: Array<{
    id: string;
    incidentNumber: string;
    state: TicketState;
    stateEnteredAt: Date | null;
    reportedAt: Date;
    shortDescription: string;
    school: { name: string };
    device: { serialNumber: string } | null;
  }>;
}) {
  return (
    <ul className="space-y-2">
      {tickets.map((t) => (
        <li
          key={t.id}
          className="rounded-lg border border-surface-border bg-surface-muted px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <Link
              href={`/tickets/${t.id}`}
              className="font-mono text-sm text-accent hover:underline"
            >
              {t.incidentNumber}
            </Link>
            <StatePill state={t.state} />
            <SlaBadge ticket={t} compact />
            {t.device && (
              <span className="font-mono text-xs text-slate-400">
                {t.device.serialNumber}
              </span>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {t.school.name}
            </span>
          </div>
          <div className="mt-1 line-clamp-1 text-sm text-slate-300">
            {t.shortDescription}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CompactTicketList({
  tickets,
}: {
  tickets: Array<{
    id: string;
    incidentNumber: string;
    state: TicketState;
    stateEnteredAt: Date | null;
    reportedAt: Date;
    shortDescription: string;
  }>;
}) {
  return (
    <ul className="space-y-1 text-xs">
      {tickets.slice(0, 10).map((t) => (
        <li key={t.id} className="flex items-center gap-2">
          <Link
            href={`/tickets/${t.id}`}
            className="font-mono text-accent hover:underline"
          >
            {t.incidentNumber}
          </Link>
          <StatePill state={t.state} />
          <SlaBadge ticket={t} compact />
          <span className="ml-auto truncate text-slate-500">
            {t.shortDescription}
          </span>
        </li>
      ))}
      {tickets.length > 10 && (
        <li className="text-slate-500">…and {tickets.length - 10} more</li>
      )}
    </ul>
  );
}
