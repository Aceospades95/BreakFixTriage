import Link from "next/link";
import { cookies } from "next/headers";
import {
  JobStatus,
  QuoteStatus,
  RouteStatus,
  TicketState,
  type Role,
} from "@prisma/client";
import { OnboardingTour } from "@/components/onboarding-tour";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { StatePill } from "@/components/state-pill";
import { SlaBadge } from "@/components/sla-badge";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { can, PERMISSIONS } from "@/lib/auth/rbac";
import { formatRole } from "@/lib/format";
import { daysInState, slaHealth } from "@/lib/reports/sla";
import { getSlaThresholds } from "@/lib/settings/settings";
import { updateStopStatusAction } from "@/server/actions/scheduling";
import { uploadAttachmentAction } from "@/server/actions/attachments";
import { sweepQuotesAction } from "@/server/actions/quotes";

export const dynamic = "force-dynamic";

/**
 * Unified "My Day" homepage.
 *
 * Combines the personal queue (bench), today's routes with driver
 * controls, and manager KPIs into one landing page. Every role
 * sees the parts relevant to them: drivers see routes, techs see
 * their bench, managers see the ops attention queue.
 */
export default async function HomePage() {
  const session = await requireSession();
  const now = new Date();
  const isManager =
    session.role === "ADMIN" ||
    session.role === "OPS_MANAGER" ||
    session.role === "DISPATCHER";

  const canUpdateStop = can(session.role, PERMISSIONS.STOPS_UPDATE);
  const canSeeScheduling = can(session.role, PERMISSIONS.SCHEDULING_READ);

  const thresholds = await getSlaThresholds();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

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

  const [
    myOpenTickets,
    myUnreadNotifications,
    overdueTicketsAll,
    pendingDuplicates,
    expiringQuotes,
    invoicesPending,
    unscheduledJobs,
    todaysRoutes,
    myRoutes,
    openTimer,
    allBenchCounts,
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        assignedUserId: session.userId,
        state: { in: activeStates },
      },
      orderBy: { stateEnteredAt: "asc" },
      include: {
        school: { select: { name: true } },
        device: { select: { serialNumber: true } },
      },
      take: 20,
    }),
    prisma.inAppNotification.count({
      where: { recipientUserId: session.userId, readAt: null },
    }),
    isManager
      ? prisma.ticket.findMany({
          where: { state: { notIn: ["CLOSED", "ON_HOLD"] as TicketState[] } },
          orderBy: { stateEnteredAt: "asc" },
          take: 50,
          select: {
            id: true,
            incidentNumber: true,
            state: true,
            stateEnteredAt: true,
            reportedAt: true,
            shortDescription: true,
            school: { select: { name: true } },
            assignee: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    isManager
      ? prisma.duplicateConflict.count({ where: { resolvedAt: null } })
      : Promise.resolve(0),
    isManager
      ? prisma.quote.count({
          where: {
            status: { in: [QuoteStatus.SENT, QuoteStatus.APPROVED] },
            holdUntil: { lte: now },
          },
        })
      : Promise.resolve(0),
    isManager
      ? prisma.ticket.count({ where: { state: "INVOICE_REQUIRED" } })
      : Promise.resolve(0),
    isManager
      ? prisma.job.count({ where: { status: "UNSCHEDULED" } })
      : Promise.resolve(0),
    isManager
      ? prisma.route.findMany({
          where: { date: { gte: todayStart, lt: tomorrowStart } },
          include: {
            assignee: { select: { name: true } },
            stops: { select: { id: true, status: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 10,
        })
      : Promise.resolve([]),
    canSeeScheduling
      ? prisma.route.findMany({
          where: {
            assigneeUserId: session.userId,
            status: {
              in: [
                RouteStatus.DRAFT,
                RouteStatus.PLANNED,
                RouteStatus.IN_PROGRESS,
              ],
            },
            date: { lt: tomorrowStart },
          },
          orderBy: { date: "asc" },
          include: {
            stops: {
              orderBy: { sequence: "asc" },
              include: {
                job: {
                  include: {
                    school: {
                      select: {
                        name: true,
                        code: true,
                        address: {
                          select: {
                            line1: true,
                            city: true,
                            state: true,
                            postalCode: true,
                            latitude: true,
                            longitude: true,
                          },
                        },
                      },
                    },
                    ticketLinks: {
                      include: {
                        ticket: {
                          select: {
                            id: true,
                            incidentNumber: true,
                            shortDescription: true,
                            state: true,
                          },
                        },
                      },
                    },
                  },
                },
                // Active device lines decide whether one-tap Complete
                // is allowed here or the driver must use the stop's
                // per-device check-off on the route page.
                stopDevices: {
                  where: { removedAt: null },
                  select: { id: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.timeEntry.findFirst({
      where: { userId: session.userId, endedAt: null },
      include: { ticket: { select: { id: true, incidentNumber: true } } },
    }),
    isManager
      ? prisma.ticket.groupBy({
          by: ["assignedUserId"],
          where: {
            state: { in: activeStates },
            assignedUserId: { not: null },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  // Fetch user names for bench counts (manager view)
  const benchAssigneeIds = allBenchCounts
    .map((r) => r.assignedUserId)
    .filter((id): id is string => id != null);
  const benchUsers =
    benchAssigneeIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: benchAssigneeIds } },
          select: { id: true, name: true, role: true },
        })
      : [];
  const benchUserMap = new Map(benchUsers.map((u) => [u.id, u]));

  const overdueBreached = overdueTicketsAll.filter((t) => {
    const days = daysInState(t, now);
    return slaHealth(t.state, days, thresholds) === "breached";
  });
  const myBreached = myOpenTickets.filter((t) => {
    const days = daysInState(t, now);
    return slaHealth(t.state, days, thresholds) === "breached";
  });

  const totalStops = myRoutes.reduce((a, r) => a + r.stops.length, 0);
  const doneStops = myRoutes.reduce(
    (a, r) =>
      a +
      r.stops.filter(
        (s) =>
          s.status === JobStatus.COMPLETED ||
          s.status === JobStatus.FAILED ||
          s.status === JobStatus.CANCELLED,
      ).length,
    0,
  );

  const firstName = session.name.split(" ")[0] ?? session.name;
  const onboardingDone = cookies().get("bft_onboarding_done")?.value === "1";

  return (
    <>
      <OnboardingTour role={session.role} alreadyDone={onboardingDone} />

      {/* Running timer banner */}
      {openTimer && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
          <span className="text-amber-100">
            Timer running on{" "}
            <Link
              href={`/tickets/${openTimer.ticket.incidentNumber}`}
              className="font-medium tracking-tight text-amber-200 underline"
            >
              {openTimer.ticket.incidentNumber}
            </Link>{" "}
            since{" "}
            {openTimer.startedAt.toISOString().replace("T", " ").slice(11, 16)}.
          </span>
          <Link
            href={`/tickets/${openTimer.ticket.incidentNumber}`}
            className="rounded bg-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/50"
          >
            Stop / review
          </Link>
        </div>
      )}

      <PageHeader
        title={`My day`}
        subtitle={greeting(now, firstName, myOpenTickets.length, myRoutes.length)}
      />

      {/* ── Notifications badge ── */}
      {myUnreadNotifications > 0 && (
        <Link
          href="/notifications"
          className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 transition hover:border-accent"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-lg font-semibold text-amber-200">
            {myUnreadNotifications}
          </span>
          <div>
            <div className="text-sm font-medium text-slate-100">
              Unread notification{myUnreadNotifications === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-slate-400">
              Assignments and escalations waiting for you
            </div>
          </div>
        </Link>
      )}

      <div className="space-y-8">
        {/* ── My Routes (driver controls) ── */}
        {canSeeScheduling && myRoutes.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Today&apos;s routes{" "}
                <span className="font-medium tracking-tight text-xs text-slate-500">
                  {doneStops}/{totalStops} stops done
                </span>
              </h2>
              <Link
                href="/scheduling"
                className="text-xs text-slate-400 hover:text-white"
              >
                All scheduling →
              </Link>
            </div>
            <div className="space-y-6">
              {myRoutes.map((route) => (
                <div
                  key={route.id}
                  className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        {route.date.toISOString().slice(0, 10)}
                        {route.vehicleRef && (
                          <span className="ml-2 font-medium tracking-tight text-xs text-slate-400">
                            {route.vehicleRef}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {route.stops.length} stop
                        {route.stops.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Link
                      href={`/scheduling/routes/${route.id}`}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Full details →
                    </Link>
                  </div>

                  <ol className="space-y-3">
                    {route.stops.map((stop) => (
                      <li
                        key={stop.id}
                        className="rounded border border-surface-border bg-surface p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-border font-medium tracking-tight text-xs">
                                {stop.sequence}
                              </span>
                              <span>{stop.job.school.name}</span>
                              <span className="rounded bg-surface-border px-1.5 py-0.5 font-medium tracking-tight text-[10px] uppercase">
                                {stop.job.type}
                              </span>
                            </div>
                            {stop.job.school.address && (
                              <div className="mt-1 text-xs text-slate-400">
                                <a
                                  href={buildMapsUrl(
                                    stop.job.school.address,
                                    stop.job.school.name,
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent hover:underline"
                                >
                                  {stop.job.school.address.line1},{" "}
                                  {stop.job.school.address.city},{" "}
                                  {stop.job.school.address.state}{" "}
                                  {stop.job.school.address.postalCode} ↗
                                </a>
                              </div>
                            )}
                            <ul className="mt-2 space-y-1 text-xs">
                              {stop.job.ticketLinks.map((tl) => (
                                <li
                                  key={tl.ticket.id}
                                  className="flex items-center gap-2"
                                >
                                  <Link
                                    href={`/tickets/${tl.ticket.incidentNumber}`}
                                    className="font-medium tracking-tight text-accent hover:underline"
                                  >
                                    {tl.ticket.incidentNumber}
                                  </Link>
                                  <StatePill state={tl.ticket.state} />
                                  <span className="truncate text-slate-400">
                                    {tl.ticket.shortDescription}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <StopStatusPill status={stop.status} />
                        </div>

                        {canUpdateStop && (
                          <>
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <DriverButton
                                stopId={stop.id}
                                routeId={route.id}
                                target={JobStatus.EN_ROUTE}
                                label="Start"
                                enabled={stop.status === JobStatus.SCHEDULED}
                                tone="primary"
                              />
                              <DriverButton
                                stopId={stop.id}
                                routeId={route.id}
                                target={JobStatus.ARRIVED}
                                label="Arrived"
                                enabled={stop.status === JobStatus.EN_ROUTE}
                                tone="primary"
                              />
                              {stop.stopDevices.length > 0 ? (
                                // Stops with device lines must be
                                // completed through the per-device
                                // check-off on the route page — a bare
                                // Complete here would only bounce off
                                // the server guard with an error the
                                // driver can't act on from this card.
                                <Link
                                  href={`/scheduling/routes/${route.id}`}
                                  className={`w-full rounded px-3 py-2 text-center text-sm font-semibold ${
                                    stop.status === JobStatus.EN_ROUTE ||
                                    stop.status === JobStatus.ARRIVED
                                      ? "bg-accent hover:bg-accent-strong"
                                      : "cursor-not-allowed border border-surface-border bg-surface text-slate-500"
                                  }`}
                                  title={`Check off the ${stop.stopDevices.length} device${stop.stopDevices.length === 1 ? "" : "s"} on this stop to complete it`}
                                >
                                  Complete…
                                </Link>
                              ) : (
                                <DriverButton
                                  stopId={stop.id}
                                  routeId={route.id}
                                  target={JobStatus.COMPLETED}
                                  label="Complete"
                                  enabled={
                                    stop.status === JobStatus.EN_ROUTE ||
                                    stop.status === JobStatus.ARRIVED
                                  }
                                  tone="primary"
                                />
                              )}
                              <DriverButton
                                stopId={stop.id}
                                routeId={route.id}
                                target={JobStatus.FAILED}
                                label="Fail"
                                enabled={
                                  stop.status !== JobStatus.COMPLETED &&
                                  stop.status !== JobStatus.FAILED &&
                                  stop.status !== JobStatus.CANCELLED
                                }
                                tone="danger"
                                confirmMessage="Mark this stop as failed? Its tickets go back to the reschedule queue. Open the route page instead if you want to record why."
                              />
                            </div>
                            <form
                              action={uploadAttachmentAction}
                              encType="multipart/form-data"
                              className="mt-3 flex items-center gap-2 border-t border-surface-border pt-3"
                            >
                              <input type="hidden" name="kind" value="ROUTE_STOP" />
                              <input type="hidden" name="routeStopId" value={stop.id} />
                              <input type="hidden" name="returnTo" value="/" />
                              <label className="min-w-0 flex-1">
                                <span className="sr-only">Upload photo</span>
                                <input
                                  type="file"
                                  name="file"
                                  required
                                  accept="image/*"
                                  capture="environment"
                                  className="w-full rounded border border-surface-border bg-surface px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-0.5 file:text-[10px] file:font-semibold file:text-white"
                                />
                              </label>
                              <button
                                type="submit"
                                className="rounded bg-accent px-3 py-1 text-xs font-semibold hover:bg-accent-strong"
                              >
                                Attach photo
                              </button>
                            </form>
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── My Bench / Queue ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              My queue{" "}
              <span className="font-medium tracking-tight text-xs text-slate-500">
                ({myOpenTickets.length})
              </span>
            </h2>
            <Link
              href="/bench"
              className="text-xs text-slate-400 hover:text-white"
            >
              Full bench →
            </Link>
          </div>
          {myOpenTickets.length === 0 ? (
            <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-8 text-center text-sm text-slate-400">
              Nothing assigned to you right now. Drop by the{" "}
              <Link
                href="/tickets?state=TRIAGE"
                className="text-accent underline decoration-accent/40 hover:decoration-accent"
              >
                triage queue
              </Link>
              .
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {myOpenTickets.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg border border-surface-border bg-surface-muted px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/tickets/${t.incidentNumber}`}
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
              {myBreached.length > 0 && (
                <p className="mt-3 text-xs text-red-300">
                  {myBreached.length} of your {myOpenTickets.length} tickets are
                  past SLA — tackle those first.
                </p>
              )}
            </>
          )}
        </section>

        {/* ── Team Bench Overview (managers) ── */}
        {isManager && allBenchCounts.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Team queues
              </h2>
              <Link
                href="/bench?scope=all"
                className="text-xs text-slate-400 hover:text-white"
              >
                All benches →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {allBenchCounts
                .sort((a, b) => b._count._all - a._count._all)
                .slice(0, 8)
                .map((row) => {
                  const user = benchUserMap.get(row.assignedUserId!);
                  return (
                    <Link
                      key={row.assignedUserId}
                      href={`/bench?scope=all&highlight=${row.assignedUserId}`}
                      className="rounded-lg border border-surface-border bg-surface-muted p-3 transition hover:border-accent"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100">
                            {user?.name ?? "Unknown"}
                          </div>
                          <div className="font-medium tracking-tight text-[10px] uppercase text-slate-500">
                            {user?.role ? formatRole(user.role) : "—"}
                          </div>
                        </div>
                        <span className="rounded bg-surface-border px-2 py-0.5 font-medium tracking-tight text-xs">
                          {row._count._all}
                        </span>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </section>
        )}

        {/* ── Today's routes overview (managers) ── */}
        {isManager && todaysRoutes.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Today&apos;s routes
              </h2>
              <Link
                href="/scheduling"
                className="text-xs text-slate-400 hover:text-white"
              >
                Scheduling →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {todaysRoutes.map((r) => (
                <Link
                  key={r.id}
                  href={`/scheduling/routes/${r.id}`}
                  className="rounded-lg border border-surface-border bg-surface-muted p-3 transition hover:border-accent"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.assignee.name}</span>
                    <span className="font-medium tracking-tight text-xs text-slate-500">
                      {r.stops.filter((s) => s.status === "COMPLETED").length}
                      /{r.stops.length}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Manager attention queue ── */}
        {isManager && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
              Ops attention
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/*
                Findings §2#9 + §6.MyDay reconciliation:
                "SLA breached" and "Aging > 30 days" are NOT the same
                metric. Both are docs/ui-conventions.md §9-aligned,
                but they answer different questions:

                  SLA breached  = floor(now - stateEnteredAt) >= the
                                  state's SLA threshold (state-aware,
                                  state-dependent threshold; see
                                  src/lib/reports/sla.ts::slaHealth)
                  Aging > 30d   = floor(now - reportedAt) > 30
                                  (state-agnostic, anchored at
                                  reportedAt; see
                                  src/lib/reports/sla.ts::isAgingOpenTicket)

                A ticket can be one without the other. Tiles now
                carry a `hint` tooltip so operators can read the
                definition; the tile clicks anchor to the inline
                breached panel below.
              */}
              {/* Round-13 §3B — promote the in-page anchor jump
                  to a filtered /tickets navigation so the card is
                  a real deep-link, not just a scroll target. The
                  in-page list below still renders for context. */}
              <Kpi
                label="SLA breached"
                value={overdueBreached.length}
                href="/tickets?slaHealth=breached&state=open"
                hint="Open tickets where days-in-current-state has crossed that state's SLA threshold."
                emphasize={overdueBreached.length > 0}
              />
              <Kpi
                label="Pending duplicates"
                value={pendingDuplicates}
                href="/duplicates"
                hint="Conflicts in the import pipeline awaiting human review."
                emphasize={pendingDuplicates > 0}
              />
              <Kpi
                label="Quotes expired"
                value={expiringQuotes}
                href="/quotes"
                hint="Sent or approved quotes whose hold-window has passed and are ready to sweep."
                emphasize={expiringQuotes > 0}
              />
              <Kpi
                label="Invoices needed"
                value={invoicesPending}
                href="/tickets?state=INVOICE_REQUIRED"
                hint="Tickets in INVOICE_REQUIRED state — billing closes them."
                emphasize={invoicesPending > 0}
              />
              <Kpi
                label="Unscheduled jobs"
                value={unscheduledJobs}
                href="/scheduling/routes/new"
                hint="Pickup or delivery jobs not yet on a route."
                emphasize={unscheduledJobs > 0}
              />
              <Kpi
                label="Active routes"
                value={todaysRoutes.length}
                href="/scheduling"
                hint="Routes scheduled for today (planned + in progress). Matches the count on /scheduling."
              />
            </div>

            {/* Inline sweep action — matches the banner on /quotes,
                same server action, no duplicated logic. Closes the
                §6.MyDay "consolidate the action behavior" item. */}
            {expiringQuotes > 0 && can(session.role, PERMISSIONS.QUOTES_WRITE) && (
              <div className="mt-3 flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <span>
                  <strong>{expiringQuotes}</strong> sent or approved quote
                  {expiringQuotes === 1 ? "" : "s"} past their hold window.
                </span>
                <form action={sweepQuotesAction}>
                  <button
                    type="submit"
                    className="rounded bg-amber-500/30 px-3 py-1 text-xs font-semibold hover:bg-amber-500/50"
                  >
                    Sweep now
                  </button>
                </form>
              </div>
            )}

            {overdueBreached.length > 0 && (
              <div
                id="sla-breached"
                className="mt-4 scroll-mt-20 rounded-lg border border-red-500/40 bg-red-500/5 p-4"
              >
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-red-200">
                  Oldest SLA-breached tickets
                </h3>
                <ul className="space-y-1 text-sm">
                  {overdueBreached.slice(0, 8).map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center gap-3 rounded px-2 py-1 hover:bg-red-500/5"
                    >
                      <Link
                        href={`/tickets/${t.incidentNumber}`}
                        className="font-medium tracking-tight text-red-200 hover:underline"
                      >
                        {t.incidentNumber}
                      </Link>
                      <StatePill state={t.state} />
                      <SlaBadge ticket={t} compact />
                      <span className="min-w-0 flex-1 truncate text-slate-300">
                        {t.shortDescription}
                      </span>
                      <span className="text-xs text-slate-500">
                        {t.assignee?.name ?? "unassigned"} · {t.school.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

/* ── Helper components ── */

function greeting(
  now: Date,
  name: string,
  ticketCount: number,
  routeCount: number,
): string {
  const hour = now.getHours();
  const time =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const parts: string[] = [];
  if (ticketCount > 0) parts.push(`${ticketCount} ticket${ticketCount === 1 ? "" : "s"} in your queue`);
  if (routeCount > 0) parts.push(`${routeCount} route${routeCount === 1 ? "" : "s"} today`);
  if (parts.length === 0) return `${time}, ${name}. Nothing on your plate right now.`;
  return `${time}, ${name}. ${parts.join(", ")}.`;
}

function Kpi({
  label,
  value,
  href,
  hint,
  emphasize = false,
}: {
  label: string;
  value: number;
  href: string;
  /** Tooltip explaining the metric — closes findings §6.MyDay
      definition reconciliation requirement. */
  hint?: string;
  emphasize?: boolean;
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

function DriverButton({
  stopId,
  routeId,
  target,
  label,
  enabled,
  tone,
  confirmMessage,
}: {
  stopId: string;
  routeId: string;
  target: JobStatus;
  label: string;
  enabled: boolean;
  tone: "primary" | "danger";
  /** When set, a confirm() gate fires before the form submits. */
  confirmMessage?: string;
}) {
  const enabledCls =
    tone === "danger"
      ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:bg-red-500/30"
      : "bg-accent hover:bg-accent-strong";
  const cls = `w-full rounded px-3 py-2 text-sm font-semibold ${
    enabled
      ? enabledCls
      : "cursor-not-allowed border border-surface-border bg-surface text-slate-500"
  }`;
  return (
    <form action={updateStopStatusAction}>
      <input type="hidden" name="stopId" value={stopId} />
      <input type="hidden" name="status" value={target} />
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="returnTo" value="/" />
      {confirmMessage ? (
        <ConfirmButton
          message={confirmMessage}
          disabled={!enabled}
          className={cls}
        >
          {label}
        </ConfirmButton>
      ) : (
        <button type="submit" disabled={!enabled} className={cls}>
          {label}
        </button>
      )}
    </form>
  );
}

function StopStatusPill({ status }: { status: JobStatus }) {
  const cls: Record<JobStatus, string> = {
    UNSCHEDULED: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    SCHEDULED: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
    EN_ROUTE: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    ARRIVED: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    COMPLETED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    FAILED: "bg-red-500/20 text-red-200 border-red-500/40",
    CANCELLED: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 font-medium tracking-tight text-[10px] uppercase tracking-wide ${cls[status]}`}
    >
      {status}
    </span>
  );
}

function buildMapsUrl(
  address: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
  },
  schoolName: string,
): string {
  const textQuery = `${schoolName}, ${address.line1}, ${address.city}, ${address.state} ${address.postalCode}`;
  if (address.latitude != null && address.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${address.latitude},${address.longitude}`,
    )}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(textQuery)}`;
}
