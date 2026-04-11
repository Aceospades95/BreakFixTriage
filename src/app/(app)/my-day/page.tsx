import Link from "next/link";
import { JobStatus, RouteStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatePill } from "@/components/state-pill";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { updateStopStatusAction } from "@/server/actions/scheduling";
import { uploadAttachmentAction } from "@/server/actions/attachments";

export const dynamic = "force-dynamic";

/**
 * Driver day view. Shows the route(s) the signed-in user is assigned to
 * for today (and anything still open from yesterday so nothing gets
 * stranded). Optimized for quick one-tap status updates on a phone.
 */
export default async function MyDayPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canUpdateStop = can(session.role, PERMISSIONS.STOPS_UPDATE);

  const now = new Date();
  const tomorrowUtc = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
  );

  const routes = await prisma.route.findMany({
    where: {
      assigneeUserId: session.userId,
      status: {
        in: [
          RouteStatus.DRAFT,
          RouteStatus.PLANNED,
          RouteStatus.IN_PROGRESS,
        ],
      },
      date: { lt: tomorrowUtc },
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
        },
      },
    },
  });

  const totalStops = routes.reduce((a, r) => a + r.stops.length, 0);
  const doneStops = routes.reduce(
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

  return (
    <>
      <PageHeader
        title="My day"
        subtitle={
          routes.length === 0
            ? "No routes assigned to you right now."
            : `${doneStops}/${totalStops} stops done`
        }
      />

      {searchParams?.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}

      {routes.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/40 p-10 text-center text-sm text-slate-400">
          Nothing to do today. Check in with dispatch if you expected a
          route.
        </div>
      ) : (
        <div className="space-y-8">
          {routes.map((route) => (
            <section
              key={route.id}
              className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    {route.date.toISOString().slice(0, 10)}
                    {route.vehicleRef && (
                      <span className="ml-2 font-mono text-xs text-slate-400">
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
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-border font-mono text-xs">
                            {stop.sequence}
                          </span>
                          <span>{stop.job.school.name}</span>
                          <span className="rounded bg-surface-border px-1.5 py-0.5 font-mono text-[10px] uppercase">
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
                          />
                        </div>
                        <form
                          action={uploadAttachmentAction}
                          encType="multipart/form-data"
                          className="mt-3 flex items-center gap-2 border-t border-surface-border pt-3"
                        >
                          <input type="hidden" name="kind" value="ROUTE_STOP" />
                          <input type="hidden" name="routeStopId" value={stop.id} />
                          <input type="hidden" name="returnTo" value="/my-day" />
                          <label className="flex-1 min-w-0">
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
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function DriverButton({
  stopId,
  routeId,
  target,
  label,
  enabled,
  tone,
}: {
  stopId: string;
  routeId: string;
  target: JobStatus;
  label: string;
  enabled: boolean;
  tone: "primary" | "danger";
}) {
  const enabledCls =
    tone === "danger"
      ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:bg-red-500/30"
      : "bg-accent hover:bg-accent-strong";
  return (
    <form action={updateStopStatusAction}>
      <input type="hidden" name="stopId" value={stopId} />
      <input type="hidden" name="status" value={target} />
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="returnTo" value="my-day" />
      <button
        type="submit"
        disabled={!enabled}
        className={`w-full rounded px-3 py-2 text-sm font-semibold ${
          enabled
            ? enabledCls
            : "cursor-not-allowed border border-surface-border bg-surface text-slate-500"
        }`}
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

/**
 * Build a map URL a phone can hand off to Google / Apple Maps. Uses
 * `geo:lat,lng?q=...` when coordinates are available (phones route
 * this to whichever map app is set as the default), otherwise
 * falls back to a Google Maps search URL so tablets and desktops
 * still get a click target.
 */
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
