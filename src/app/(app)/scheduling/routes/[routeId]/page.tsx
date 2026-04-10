import Link from "next/link";
import { notFound } from "next/navigation";
import { JobStatus, RouteStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import {
  cancelRouteAction,
  reorderRouteAction,
  updateStopStatusAction,
} from "@/server/actions/scheduling";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({
  params,
  searchParams,
}: {
  params: { routeId: string };
  searchParams?: { error?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canReorder = can(session.role, PERMISSIONS.ROUTES_BUILD);
  const canUpdateStop = can(session.role, PERMISSIONS.STOPS_UPDATE);

  const route = await prisma.route.findUnique({
    where: { id: params.routeId },
    include: {
      assignee: { select: { id: true, name: true, role: true } },
      stops: {
        orderBy: { sequence: "asc" },
        include: {
          job: {
            include: {
              school: {
                select: { id: true, name: true, code: true },
              },
              ticketLinks: {
                include: {
                  ticket: {
                    select: {
                      id: true,
                      incidentNumber: true,
                      state: true,
                      shortDescription: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!route) notFound();

  const stopIds = route.stops.map((s) => s.id);
  const routeOpen =
    route.status === RouteStatus.DRAFT ||
    route.status === RouteStatus.PLANNED ||
    route.status === RouteStatus.IN_PROGRESS;
  const reorderAllowed =
    canReorder &&
    (route.status === RouteStatus.DRAFT ||
      route.status === RouteStatus.PLANNED);

  return (
    <>
      <PageHeader
        title={`Route ${route.date.toISOString().slice(0, 10)}`}
        subtitle={`${route.assignee.name} · ${route.stops.length} stop${route.stops.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <RouteStatusPill status={route.status} />
            <Link
              href="/scheduling"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              ← Back
            </Link>
          </div>
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      <div className="mb-6 grid gap-3 rounded-lg border border-surface-border bg-surface-muted/60 p-4 sm:grid-cols-3">
        <Meta label="Vehicle" value={route.vehicleRef ?? "—"} />
        <Meta label="Optimizer" value={route.optimizerName ?? "—"} />
        <Meta
          label="Last optimized"
          value={
            route.optimizedAt
              ? route.optimizedAt.toISOString().replace("T", " ").slice(0, 16)
              : "—"
          }
        />
      </div>

      {route.stops.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
          This route has no stops.
        </div>
      ) : (
        <ol className="space-y-3">
          {route.stops.map((stop, idx) => {
            const canMoveUp = reorderAllowed && idx > 0;
            const canMoveDown = reorderAllowed && idx < route.stops.length - 1;
            const moveUpOrder = canMoveUp
              ? swap(stopIds, idx, idx - 1)
              : null;
            const moveDownOrder = canMoveDown
              ? swap(stopIds, idx, idx + 1)
              : null;

            return (
              <li
                key={stop.id}
                className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-border font-mono text-xs">
                        {stop.sequence}
                      </span>
                      <span>{stop.job.school.name}</span>
                      {stop.job.school.code && (
                        <span className="font-mono text-xs text-slate-500">
                          {stop.job.school.code}
                        </span>
                      )}
                      <span className="rounded bg-surface-border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                        {stop.job.type}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                      {stop.job.ticketLinks.map((tl) => (
                        <li
                          key={tl.ticket.id}
                          className="flex items-center gap-2"
                        >
                          <Link
                            href={`/tickets/${tl.ticket.id}`}
                            className="font-mono text-accent hover:underline"
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

                {(canUpdateStop || reorderAllowed) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canUpdateStop && routeOpen && (
                      <StopStatusControls
                        stopId={stop.id}
                        routeId={route.id}
                        current={stop.status}
                      />
                    )}
                    {reorderAllowed && (
                      <>
                        {moveUpOrder && (
                          <ReorderButton
                            routeId={route.id}
                            orderedStopIds={moveUpOrder}
                            label="↑ Move up"
                          />
                        )}
                        {moveDownOrder && (
                          <ReorderButton
                            routeId={route.id}
                            orderedStopIds={moveDownOrder}
                            label="↓ Move down"
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {canReorder && routeOpen && (
        <form
          action={cancelRouteAction}
          className="mt-8 flex flex-wrap items-end gap-2 rounded border border-red-500/30 bg-red-500/5 p-3"
        >
          <input type="hidden" name="routeId" value={route.id} />
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Cancel this route
            </span>
            <input
              type="text"
              name="reason"
              placeholder="Reason (optional)"
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-500/30"
          >
            Cancel route
          </button>
        </form>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

function StopStatusControls({
  stopId,
  routeId,
  current,
}: {
  stopId: string;
  routeId: string;
  current: JobStatus;
}) {
  const buttons: { to: JobStatus; label: string; enabled: boolean }[] = [
    {
      to: JobStatus.EN_ROUTE,
      label: "Start",
      enabled: current === JobStatus.SCHEDULED,
    },
    {
      to: JobStatus.ARRIVED,
      label: "Arrived",
      enabled: current === JobStatus.EN_ROUTE,
    },
    {
      to: JobStatus.COMPLETED,
      label: "Complete",
      enabled:
        current === JobStatus.EN_ROUTE || current === JobStatus.ARRIVED,
    },
    {
      to: JobStatus.FAILED,
      label: "Fail",
      enabled:
        current !== JobStatus.COMPLETED &&
        current !== JobStatus.FAILED &&
        current !== JobStatus.CANCELLED,
    },
  ];
  return (
    <>
      {buttons.map((b) => (
        <form key={b.to} action={updateStopStatusAction}>
          <input type="hidden" name="stopId" value={stopId} />
          <input type="hidden" name="status" value={b.to} />
          <input type="hidden" name="routeId" value={routeId} />
          <input type="hidden" name="returnTo" value="route" />
          <button
            type="submit"
            disabled={!b.enabled}
            className={`rounded px-2 py-1 text-xs font-semibold ${
              b.enabled
                ? b.to === JobStatus.FAILED
                  ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:bg-red-500/30"
                  : "bg-accent hover:bg-accent-strong"
                : "cursor-not-allowed border border-surface-border bg-surface text-slate-500"
            }`}
          >
            {b.label}
          </button>
        </form>
      ))}
    </>
  );
}

function ReorderButton({
  routeId,
  orderedStopIds,
  label,
}: {
  routeId: string;
  orderedStopIds: string[];
  label: string;
}) {
  return (
    <form action={reorderRouteAction}>
      <input type="hidden" name="routeId" value={routeId} />
      {orderedStopIds.map((id) => (
        <input key={id} type="hidden" name="orderedStopIds" value={id} />
      ))}
      <button
        type="submit"
        className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-white"
      >
        {label}
      </button>
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
      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${cls[status]}`}
    >
      {status}
    </span>
  );
}

function RouteStatusPill({ status }: { status: RouteStatus }) {
  const cls: Record<RouteStatus, string> = {
    DRAFT: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    PLANNED: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
    IN_PROGRESS: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    COMPLETED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    CANCELLED: "bg-red-500/20 text-red-200 border-red-500/40",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${cls[status]}`}
    >
      {status}
    </span>
  );
}

function swap<T>(arr: readonly T[], i: number, j: number): T[] {
  const out = arr.slice();
  const tmp = out[i];
  const other = out[j];
  if (tmp === undefined || other === undefined) return out;
  out[i] = other;
  out[j] = tmp;
  return out;
}
