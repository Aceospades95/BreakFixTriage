import Link from "next/link";
import { QuoteStatus, TicketState } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { SlaBadge } from "@/components/sla-badge";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { daysInState, slaHealth } from "@/lib/reports/sla";
import { getSlaThresholds } from "@/lib/settings/settings";

export const dynamic = "force-dynamic";

/**
 * Home page: "What needs your attention today?"
 *
 * The Phase 9 home page was pure KPIs. Phase 10 makes it action-
 * oriented: your own queue, unread shift notes, SLA breaches, a
 * manager block that surfaces pending duplicates + expired quotes
 * + invoices needed + unscheduled jobs. Every tile links to the
 * exact queue it summarizes, and the running-timer banner gives
 * techs a one-click way back to their active ticket.
 */
export default async function HomePage() {
  const session = await requireSession();
  const now = new Date();
  const isManager =
    session.role === "ADMIN" ||
    session.role === "OPS_MANAGER" ||
    session.role === "DISPATCHER";

  const thresholds = await getSlaThresholds();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [
    myOpenTickets,
    myUnreadNotifications,
    recentShiftNotes,
    overdueTicketsAll,
    pendingDuplicates,
    expiringQuotes,
    invoicesPending,
    unscheduledJobs,
    todaysRoutes,
    openTimer,
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        assignedUserId: session.userId,
        state: { notIn: ["CLOSED", "ON_HOLD"] as TicketState[] },
      },
      orderBy: { stateEnteredAt: "asc" },
      include: {
        school: { select: { name: true } },
        device: { select: { serialNumber: true } },
      },
      take: 8,
    }),
    prisma.inAppNotification.count({
      where: { recipientUserId: session.userId, readAt: null },
    }),
    prisma.shiftNote.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { author: { select: { name: true } } },
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
            status: QuoteStatus.SENT,
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
    prisma.route.findMany({
      where: { date: { gte: todayStart, lt: tomorrowStart } },
      include: {
        assignee: { select: { name: true } },
        stops: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.timeEntry.findFirst({
      where: { userId: session.userId, endedAt: null },
      include: { ticket: { select: { id: true, incidentNumber: true } } },
    }),
  ]);

  const overdueBreached = overdueTicketsAll.filter((t) => {
    const days = daysInState(t, now);
    return slaHealth(t.state, days, thresholds) === "breached";
  });
  const myBreached = myOpenTickets.filter((t) => {
    const days = daysInState(t, now);
    return slaHealth(t.state, days, thresholds) === "breached";
  });

  const firstName = session.name.split(" ")[0] ?? session.name;

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        subtitle={
          isManager
            ? "Operational snapshot and your action queues."
            : "Your queue and the notes you should read."
        }
      />

      {openTimer && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
          <span className="text-amber-100">
            ⏱ Timer running on{" "}
            <Link
              href={`/tickets/${openTimer.ticket.id}`}
              className="font-mono text-amber-200 underline"
            >
              {openTimer.ticket.incidentNumber}
            </Link>{" "}
            since{" "}
            {openTimer.startedAt.toISOString().replace("T", " ").slice(11, 16)}.
          </span>
          <Link
            href={`/tickets/${openTimer.ticket.id}`}
            className="rounded bg-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/50"
          >
            Stop / review
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-surface-border bg-surface-muted/60 p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Your queue{" "}
              <span className="font-mono text-xs text-slate-500">
                ({myOpenTickets.length})
              </span>
            </h2>
            <Link
              href="/bench"
              className="text-xs text-slate-400 hover:text-white"
            >
              Open bench →
            </Link>
          </div>
          {myOpenTickets.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nothing assigned to you. Drop by the{" "}
              <Link
                href="/tickets?state=TRIAGE"
                className="text-accent hover:underline"
              >
                triage queue
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {myOpenTickets.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 rounded border border-surface-border bg-surface px-3 py-2"
                >
                  <Link
                    href={`/tickets/${t.id}`}
                    className="font-mono text-sm text-accent hover:underline"
                  >
                    {t.incidentNumber}
                  </Link>
                  <StatePill state={t.state} />
                  <SlaBadge ticket={t} compact />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                    {t.shortDescription}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t.school.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {myBreached.length > 0 && (
            <p className="mt-3 text-xs text-red-300">
              {myBreached.length} of your {myOpenTickets.length} tickets are
              past SLA — tackle those first.
            </p>
          )}
        </section>

        <section className="space-y-4">
          {myUnreadNotifications > 0 && (
            <Link
              href="/notifications"
              className="block rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 transition hover:border-accent"
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                Unread notifications
              </div>
              <div className="mt-1 text-3xl font-semibold">
                {myUnreadNotifications}
              </div>
              <p className="text-xs text-slate-400">
                Assignments and escalations waiting for you
              </p>
            </Link>
          )}

          <Link
            href="/shift-notes"
            className="block rounded-lg border border-surface-border bg-surface-muted p-4 transition hover:border-accent"
          >
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
              Recent shift notes
            </div>
            {recentShiftNotes.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing posted yet.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {recentShiftNotes.map((n) => (
                  <li key={n.id}>
                    <div className="text-slate-500">
                      {n.author.name} ·{" "}
                      {n.createdAt.toISOString().slice(5, 16).replace("T", " ")}
                    </div>
                    <div className="line-clamp-2 text-slate-300">{n.body}</div>
                  </li>
                ))}
              </ul>
            )}
          </Link>

          {todaysRoutes.length > 0 && (
            <Link
              href="/scheduling"
              className="block rounded-lg border border-surface-border bg-surface-muted p-4 transition hover:border-accent"
            >
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                Today's routes
              </div>
              <ul className="space-y-1 text-xs">
                {todaysRoutes.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between"
                  >
                    <span>{r.assignee.name}</span>
                    <span className="text-slate-500">
                      {
                        r.stops.filter((s) => s.status === "COMPLETED").length
                      }
                      /{r.stops.length}
                    </span>
                  </li>
                ))}
              </ul>
            </Link>
          )}
        </section>
      </div>

      {isManager && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Manager attention queue
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="SLA breached (open)"
              value={overdueBreached.length}
              href="/dashboards"
              emphasize={overdueBreached.length > 0}
            />
            <Kpi
              label="Pending duplicates"
              value={pendingDuplicates}
              href="/duplicates"
              emphasize={pendingDuplicates > 0}
            />
            <Kpi
              label="Quotes expired"
              value={expiringQuotes}
              href="/quotes?status=SENT"
              emphasize={expiringQuotes > 0}
            />
            <Kpi
              label="Invoices needed"
              value={invoicesPending}
              href="/invoices"
              emphasize={invoicesPending > 0}
            />
            <Kpi
              label="Unscheduled jobs"
              value={unscheduledJobs}
              href="/scheduling/routes/new"
              emphasize={unscheduledJobs > 0}
            />
            <Kpi
              label="Active routes today"
              value={todaysRoutes.length}
              href="/scheduling"
            />
          </div>

          {overdueBreached.length > 0 && (
            <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-200">
                Oldest SLA-breached tickets
              </h3>
              <ul className="space-y-1 text-sm">
                {overdueBreached.slice(0, 10).map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-3 rounded px-2 py-1 hover:bg-red-500/5"
                  >
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-mono text-red-200 hover:underline"
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
        </div>
      )}
    </>
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
