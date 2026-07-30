import Link from "next/link";
import { JobStatus, JobType, TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { RouteStatusPill } from "@/components/route-status-pill";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import {
  groupReadyTicketsBySchool,
  type ReadyTicketGroup,
} from "@/lib/scheduling/ready-groups";
import { createJobAction } from "@/server/actions/scheduling";
import { andTicketWhere, ticketWhereForSession } from "@/lib/data/forSession";
import { sortBoroughs, ticketWhereForBorough } from "@/lib/geo/boroughs";

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
  searchParams?: { error?: string; ok?: string; borough?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canWrite = can(session.role, PERMISSIONS.SCHEDULING_WRITE);
  const canBuild = can(session.role, PERMISSIONS.ROUTES_BUILD);
  const isAdmin = session.role === "ADMIN";

  // Five-borough expansion — a dispatcher works one borough at a
  // time. Without this the ready-to-schedule lists mix all five and
  // silently truncate, so the stops you need may not even be shown.
  const boroughFilter = searchParams?.borough || undefined;
  const readyWhere = andTicketWhere(
    ticketWhereForSession(session),
    ticketWhereForBorough(boroughFilter),
  );
  const boroughRows = await prisma.district.findMany({
    where: { active: true, region: { not: null } },
    distinct: ["region"],
    select: { region: true },
  });
  const boroughs = sortBoroughs(
    boroughRows.map((r) => r.region?.trim()).filter((r): r is string => Boolean(r)),
  );

  // Round-22 §4 — flag routes still open after their date has passed.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

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
    groupReadyTicketsBySchool("AWAITING_PICKUP", JobType.PICKUP, readyWhere),
    groupReadyTicketsBySchool("PENDING_DELIVERY", JobType.DELIVERY, readyWhere),
    groupReadyTicketsBySchool(
      "AWAITING_ONSITE",
      JobType.ONSITE_REPAIR,
      readyWhere,
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Scheduling"
        subtitle="Build routes from pending jobs and track what's on the road."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Five-borough expansion — a dispatcher plans one
                borough at a time; this narrows every ready-to-
                schedule column below. */}
            {boroughs.length > 0 && (
              <form method="get" className="flex items-center gap-1">
                <label
                  htmlFor="scheduling-borough"
                  className="text-[10px] uppercase tracking-wide text-slate-400"
                >
                  Borough
                </label>
                <select
                  id="scheduling-borough"
                  name="borough"
                  defaultValue={boroughFilter ?? ""}
                  className="min-w-0 max-w-full rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">All boroughs</option>
                  {boroughs.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded border border-surface-border px-2 py-1 text-xs transition hover:border-accent"
                >
                  Go
                </button>
              </form>
            )}
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
          hint="Routes in DRAFT, PLANNED, or IN_PROGRESS. Counted the same way My Day's tile shows it."
        />
        <Kpi
          label="Pending pickups"
          value={pickupGroups.total}
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
                        {r.stops.length === 1 ? "" : "s"}
                        {isAdmin && r.optimizerName && (
                          <span className="text-slate-500">
                            {" · stops in suggested driving order"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <RouteStatusPill status={r.status} />
                      {r.date < todayStart && (
                        <span
                          className="rounded border border-red-500/50 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-200"
                          title="This route is still open but its date has passed — close it out or cancel it."
                        >
                          Overdue
                        </span>
                      )}
                    </div>
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
            groups={pickupGroups.groups}
            shown={pickupGroups.shown}
            total={pickupGroups.total}
            canWrite={canWrite}
          />
          <JobCandidateColumn
            title="Deliveries"
            jobType={JobType.DELIVERY}
            ticketState="PENDING_DELIVERY"
            groups={deliveryGroups.groups}
            shown={deliveryGroups.shown}
            total={deliveryGroups.total}
            canWrite={canWrite}
          />
          <JobCandidateColumn
            title="On-site"
            jobType={JobType.ONSITE_REPAIR}
            ticketState="AWAITING_ONSITE"
            groups={onsiteGroups.groups}
            shown={onsiteGroups.shown}
            total={onsiteGroups.total}
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

function JobCandidateColumn({
  title,
  jobType,
  ticketState,
  groups,
  shown,
  total,
  canWrite,
}: {
  title: string;
  jobType: JobType;
  ticketState: TicketState;
  groups: ReadyTicketGroup[];
  /** Tickets actually rendered (capped). */
  shown: number;
  /** True number matching — the badge shows this, never the cap. */
  total: number;
  canWrite: boolean;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-muted/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded bg-surface-border px-2 py-0.5 font-medium tracking-tight text-xs">
          {total.toLocaleString()}
        </span>
      </div>
      {total > shown && (
        // Five-borough expansion — say so when the list is a slice:
        // silently showing the oldest 200 of 3,000 reads as "that is
        // all there is" and hides work. amber-200 (not 300/90)
        // because globals.css remaps 100/200 to a dark tone in light
        // mode, keeping this WCAG-AA in both themes.
        <p className="mb-2 text-[10px] text-amber-200">
          Showing the {shown} oldest — filter by borough to see the rest.
        </p>
      )}
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
                      href={`/tickets/${t.incidentNumber}`}
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
                  {/* Round-17 — land on the route builder, not back
                      here: field QA found operators clicked this,
                      saw the same page again, and concluded the
                      button did nothing. */}
                  <input type="hidden" name="returnTo" value="builder" />
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
                    Schedule {g.tickets.length} → build route
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
  hint,
}: {
  label: string;
  value: number;
  href: string;
  emphasize?: boolean;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      title={hint}
      className={`block rounded-lg border p-4 transition hover:border-accent ${
        emphasize
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-surface-border bg-surface-muted"
      }`}
    >
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
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

