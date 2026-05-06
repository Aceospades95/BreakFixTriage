import Link from "next/link";
import { TicketSource, TicketState } from "@prisma/client";
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
  // Default to "all" for managers, "me" for everyone else
  const scope = canSeeAll && searchParams?.scope !== "me" ? "all" : "me";

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
  const [ticketsByUserRaw, unassigned, unlinked] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        state: { in: activeStates },
        assignedUserId: { not: null },
      },
      orderBy: { stateEnteredAt: "asc" },
      include: {
        school: { select: { name: true } },
        device: { select: { serialNumber: true } },
      },
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
    prisma.ticket.findMany({
      where: { state: TicketState.PENDING_PICKUP_UNLINKED },
      orderBy: { reportedAt: "desc" },
      include: {
        school: { select: { name: true } },
        device: { select: { serialNumber: true } },
      },
      take: 100,
    }),
  ]);

  const byUser = new Map<string, typeof ticketsByUserRaw>();
  for (const t of ticketsByUserRaw) {
    if (!t.assignedUserId) continue;
    const bucket = byUser.get(t.assignedUserId) ?? [];
    bucket.push(t);
    byUser.set(t.assignedUserId, bucket);
  }

  const assigneeIds = Array.from(byUser.keys());
  const users =
    assigneeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        })
      : [];

  // Pin the current user's bucket to the front (if they have one).
  const sortedUsers = [
    ...users.filter((u) => u.id === session.userId),
    ...users.filter((u) => u.id !== session.userId),
  ];

  // +1 for Unassigned, +1 for Unlinked (Round-4 §N1)
  const totalBuckets = sortedUsers.length + 2;
  const totalAssignedOpen = ticketsByUserRaw.length;

  return (
    <>
      <PageHeader
        title="All benches"
        subtitle={`${totalAssignedOpen} assigned · ${unassigned.length} unassigned · ${unlinked.length} unlinked · ${sortedUsers.length} active assignee${sortedUsers.length === 1 ? "" : "s"}`}
        actions={
          <Link
            href="/bench?scope=me"
            className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
          >
            ← My bench
          </Link>
        }
      />

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div
          className="flex gap-4"
          style={{ minWidth: `${totalBuckets * 320}px` }}
        >
          {sortedUsers.map((u) => {
            const tickets = byUser.get(u.id) ?? [];
            const breached = tickets.filter((t) => {
              const days = daysInState(t, new Date());
              return slaHealth(t.state, days) === "breached";
            }).length;
            return (
              <section
                key={u.id}
                className="flex w-80 shrink-0 flex-col rounded-lg border border-surface-border bg-surface-muted p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{u.name}</div>
                    <div className="text-[10px] tracking-wide text-slate-500">
                      {u.role}
                      {u.id === session.userId && " · you"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {breached > 0 && (
                      <span
                        className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium tabular-nums text-red-200"
                        title={`${breached} past SLA`}
                      >
                        {breached} ⚠
                      </span>
                    )}
                    <span className="rounded bg-surface-border px-2 py-0.5 text-xs font-medium tabular-nums">
                      {tickets.length}
                    </span>
                  </div>
                </div>
                {tickets.length === 0 ? (
                  <p className="text-xs text-slate-400">empty</p>
                ) : (
                  <CompactTicketList tickets={tickets} />
                )}
              </section>
            );
          })}
          <section className="flex w-80 shrink-0 flex-col rounded-lg border border-surface-border bg-surface-muted p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Unassigned</div>
                <div className="text-[10px] tracking-wide text-slate-500">
                  no owner
                </div>
              </div>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-200">
                {unassigned.length}
              </span>
            </div>
            {unassigned.length === 0 ? (
              <p className="text-xs text-slate-400">empty</p>
            ) : (
              <CompactTicketList tickets={unassigned} />
            )}
          </section>
          <section className="flex w-80 shrink-0 flex-col rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-100">
                  Unlinked
                  <span
                    className="rounded border border-violet-400/40 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100"
                    title="Synthetic tickets minted on-route, awaiting SNOW link."
                  >
                    SYN
                  </span>
                </div>
                <div className="text-[10px] tracking-wide text-violet-300/80">
                  on-route synthetic · resolve at /duplicates
                </div>
              </div>
              <span className="rounded bg-violet-500/20 px-2 py-0.5 text-xs font-medium tabular-nums text-violet-100">
                {unlinked.length}
              </span>
            </div>
            {unlinked.length === 0 ? (
              <p className="text-xs text-violet-300/80">empty</p>
            ) : (
              <CompactTicketList tickets={unlinked} />
            )}
            {unlinked.length > 0 && (
              <Link
                href="/duplicates"
                className="mt-2 self-start rounded border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-100 hover:bg-violet-500/20"
              >
                Resolve at /duplicates →
              </Link>
            )}
          </section>
        </div>
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
              className="font-medium tracking-tight text-sm text-accent hover:underline"
            >
              {t.incidentNumber}
            </Link>
            <StatePill state={t.state} />
            <SlaBadge ticket={t} compact />
            {t.device && (
              <span className="font-medium tracking-tight text-xs text-slate-400">
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
            className="font-medium tracking-tight text-accent hover:underline"
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
