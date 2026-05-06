import Link from "next/link";
import { JobStatus, JobType, TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { createJobAction } from "@/server/actions/scheduling";

export const dynamic = "force-dynamic";

/**
 * Dispatcher command center. Shows:
 *   - active and recently completed routes
 *   - queue of unscheduled jobs (with CTA to build a route)
 *   - groups of tickets that are ready for pickup / delivery / onsite
 *     with quick "create job" forms
 */
export default async function SchedulingPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canWrite = can(session.role, PERMISSIONS.SCHEDULING_WRITE);
  const canBuild = can(session.role, PERMISSIONS.ROUTES_BUILD);

  const [
    activeRoutes,
    recentRoutes,
    unscheduledJobCount,
    pickupGroups,
    deliveryGroups,
    onsiteGroups,
  ] = await Promise.all([
    prisma.route.findMany({
      where: { status: { in: ["DRAFT", "PLANNED", "IN_PROGRESS"] } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 10,
      include: {
        assignee: { select: { name: true } },
        stops: true,
      },
    }),
    prisma.route.findMany({
      where: { status: { in: ["COMPLETED", "CANCELLED"] } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5,
      include: {
        assignee: { select: { name: true } },
        stops: true,
      },
    }),
    prisma.job.count({ where: { status: JobStatus.UNSCHEDULED } }),
    groupTicketsBySchool("AWAITING_PICKUP", JobType.PICKUP),
    groupTicketsBySchool("PENDING_DELIVERY", JobType.DELIVERY),
    groupTicketsBySchool("AWAITING_ONSITE", JobType.ONSITE_REPAIR),
  ]);

  return (
    <>
      <PageHeader
        title="Scheduling"
        subtitle="Build routes from pending jobs and track what's on the road."
        actions={
          <div className="flex gap-2">
            {canBuild && (
              <Link
                href="/scheduling/routes/new"
                className="rounded bg-accent px-3 py-1.5 text-sm font-semibold transition hover:bg-accent-strong"
              >
                Build route
              </Link>
            )}
            <Link
              href="/scheduling/calendar"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Calendar
            </Link>
            <Link
              href="/"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              My day
            </Link>
          </div>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      {searchParams?.ok && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {searchParams.ok}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Unscheduled jobs"
          value={unscheduledJobCount}
          href="/scheduling/routes/new"
          emphasize={unscheduledJobCount > 0}
        />
        <Kpi
          label="Active routes"
          value={activeRoutes.length}
          href="/scheduling"
        />
        <Kpi
          label="Pending pickups"
          value={pickupGroups.reduce((a, g) => a + g.tickets.length, 0)}
          href="/tickets?state=AWAITING_PICKUP"
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Active routes
        </h2>
        {activeRoutes.length === 0 ? (
          <EmptyBlock>
            No routes in progress. Build one from unscheduled jobs.
          </EmptyBlock>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {activeRoutes.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/scheduling/routes/${r.id}`}
                  className="block rounded-lg border border-surface-border bg-surface-muted/60 p-4 transition hover:border-accent"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        {r.date.toISOString().slice(0, 10)} — {r.assignee.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {r.stops.length} stop
                        {r.stops.length === 1 ? "" : "s"} · optimizer=
                        {r.optimizerName ?? "—"}
                      </div>
                    </div>
                    <RouteStatusPill status={r.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Ready to schedule
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <JobCandidateColumn
            title="Pickups"
            jobType={JobType.PICKUP}
            ticketState="AWAITING_PICKUP"
            groups={pickupGroups}
            canWrite={canWrite}
          />
          <JobCandidateColumn
            title="Deliveries"
            jobType={JobType.DELIVERY}
            ticketState="PENDING_DELIVERY"
            groups={deliveryGroups}
            canWrite={canWrite}
          />
          <JobCandidateColumn
            title="On-site"
            jobType={JobType.ONSITE_REPAIR}
            ticketState="AWAITING_ONSITE"
            groups={onsiteGroups}
            canWrite={canWrite}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Recent routes
        </h2>
        {recentRoutes.length === 0 ? (
          <EmptyBlock>No completed routes yet.</EmptyBlock>
        ) : (
          <ul className="space-y-2">
            {recentRoutes.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/scheduling/routes/${r.id}`}
                  className="flex items-center justify-between rounded border border-surface-border bg-surface-muted/40 px-3 py-2 text-sm transition hover:border-accent"
                >
                  <span>
                    {r.date.toISOString().slice(0, 10)} — {r.assignee.name}
                    <span className="ml-2 text-xs text-slate-400">
                      {r.stops.length} stop
                      {r.stops.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <RouteStatusPill status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TicketGroup {
  schoolId: string;
  schoolName: string;
  schoolCode: string | null;
  tickets: {
    id: string;
    incidentNumber: string;
    shortDescription: string;
  }[];
}

/**
 * Group tickets in the given state by school, excluding any tickets that
 * are already linked to an unscheduled job of the matching type.
 */
async function groupTicketsBySchool(
  state: TicketState,
  jobType: JobType,
): Promise<TicketGroup[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      state,
      jobLinks: {
        none: {
          job: { type: jobType, status: JobStatus.UNSCHEDULED },
        },
      },
    },
    include: { school: { select: { id: true, name: true, code: true } } },
    orderBy: { reportedAt: "asc" },
    take: 200,
  });

  const byId = new Map<string, TicketGroup>();
  for (const t of tickets) {
    const key = t.schoolId;
    let g = byId.get(key);
    if (!g) {
      g = {
        schoolId: t.school.id,
        schoolName: t.school.name,
        schoolCode: t.school.code,
        tickets: [],
      };
      byId.set(key, g);
    }
    g.tickets.push({
      id: t.id,
      incidentNumber: t.incidentNumber,
      shortDescription: t.shortDescription,
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.schoolName.localeCompare(b.schoolName),
  );
}

function JobCandidateColumn({
  title,
  jobType,
  ticketState,
  groups,
  canWrite,
}: {
  title: string;
  jobType: JobType;
  ticketState: TicketState;
  groups: TicketGroup[];
  canWrite: boolean;
}) {
  const total = groups.reduce((a, g) => a + g.tickets.length, 0);
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded bg-surface-border px-2 py-0.5 font-medium tracking-tight text-xs">
          {total}
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-slate-400">
          Nothing in <StatePill state={ticketState} /> right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li
              key={g.schoolId}
              className="rounded border border-surface-border bg-surface px-3 py-2"
            >
              <div className="text-sm font-medium">
                {g.schoolName}
                {g.schoolCode && (
                  <span className="ml-2 font-medium tracking-tight text-xs text-slate-500">
                    {g.schoolCode}
                  </span>
                )}
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                {g.tickets.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-medium tracking-tight text-accent hover:underline"
                    >
                      {t.incidentNumber}
                    </Link>
                    <span className="truncate text-slate-400">
                      {t.shortDescription}
                    </span>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <form action={createJobAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="type" value={jobType} />
                  <input type="hidden" name="schoolId" value={g.schoolId} />
                  {g.tickets.map((t) => (
                    <input
                      key={t.id}
                      type="hidden"
                      name="ticketIds"
                      value={t.id}
                    />
                  ))}
                  <button
                    type="submit"
                    className="rounded bg-accent px-2 py-1 text-[11px] font-semibold hover:bg-accent-strong"
                  >
                    Create {jobType.toLowerCase()} job ({g.tickets.length})
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  href,
  emphasize = false,
}: {
  label: string;
  value: number;
  href: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border p-4 transition hover:border-accent ${
        emphasize
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-surface-border bg-surface-muted"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </Link>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

function RouteStatusPill({
  status,
}: {
  status: "DRAFT" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}) {
  const cls =
    status === "IN_PROGRESS"
      ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
      : status === "PLANNED"
        ? "bg-indigo-500/20 text-indigo-200 border-indigo-500/40"
        : status === "COMPLETED"
          ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
          : status === "CANCELLED"
            ? "bg-red-500/20 text-red-200 border-red-500/40"
            : "bg-slate-500/20 text-slate-200 border-slate-500/40";
  return (
    <span
      className={`rounded border px-2 py-0.5 font-medium tracking-tight text-[10px] uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
