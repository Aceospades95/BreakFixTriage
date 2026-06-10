import Link from "next/link";
import { notFound } from "next/navigation";
import { JobStatus, RouteStatus, TicketSource } from "@prisma/client";
import type { TicketPriority } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { RouteStatusPill } from "@/components/route-status-pill";
import { StatePill } from "@/components/state-pill";
import { PriorityPill, PRIORITY_RANK } from "@/components/priority-pill";
import { AttachmentList } from "@/components/attachment-list";
import { RouteMap } from "@/components/route-map";
import { SignaturePad } from "@/components/signature-pad";
import { PhotoCapture } from "@/components/photo-capture";
import { StopAccordion, StopAccordionItem } from "@/components/stop-accordion";
import { StopCompletion } from "@/components/stop-completion";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import {
  cancelRouteAction,
  reorderRouteAction,
  reportStopDelayAction,
  updateRouteVehicleAction,
  updateStopStatusAction,
} from "@/server/actions/scheduling";
import { StopDelayReason } from "@prisma/client";
import {
  addDeviceToStopAction,
  removeDeviceFromStopAction,
} from "@/server/actions/stop-devices";
import { uploadAttachmentAction } from "@/server/actions/attachments";

export const dynamic = "force-dynamic";

async function loadRoute(routeId: string) {
  return prisma.route.findUnique({
    where: { id: routeId },
    include: {
      assignee: { select: { id: true, name: true, role: true } },
      stops: {
        orderBy: { sequence: "asc" },
        include: {
          job: {
            include: {
              school: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  notes: true,
                  address: {
                    select: {
                      line1: true,
                      line2: true,
                      city: true,
                      state: true,
                      postalCode: true,
                      latitude: true,
                      longitude: true,
                    },
                  },
                  mainContact: {
                    select: {
                      name: true,
                      title: true,
                      phone: true,
                      email: true,
                    },
                  },
                  contacts: {
                    where: { isPrimary: true },
                    take: 1,
                    select: {
                      name: true,
                      title: true,
                      phone: true,
                      email: true,
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
                      state: true,
                      shortDescription: true,
                      priority: true,
                    },
                  },
                },
              },
            },
          },
          attachments: {
            orderBy: { createdAt: "desc" },
            include: { uploadedBy: { select: { name: true } } },
          },
          stopDevices: {
            orderBy: { addedAt: "asc" },
            include: {
              device: {
                select: {
                  id: true,
                  serialNumber: true,
                  assetTag: true,
                  model: {
                    select: { manufacturer: true, modelName: true },
                  },
                },
              },
              ticket: {
                select: {
                  id: true,
                  incidentNumber: true,
                  state: true,
                  source: true,
                  // Round-7 §2D — when a synthetic was merged into
                  // this surviving INC, surface the synthetic's
                  // incidentNumber as a muted annotation so the
                  // route stop card preserves history without
                  // green-linking a closed/retired SYN id.
                  mergedFrom: {
                    where: { source: TicketSource.ROUTE_PICKUP },
                    select: {
                      incidentNumber: true,
                      closedAt: true,
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
}

type RouteRow = NonNullable<Awaited<ReturnType<typeof loadRoute>>>;
type StopRow = RouteRow["stops"][number];

const TERMINAL_STOP_STATUSES: JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];

export default async function RouteDetailPage({
  params,
  searchParams,
}: {
  params: { routeId: string };
  searchParams?: { error?: string; ok?: string };
}) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_READ);
  const canReorder = can(session.role, PERMISSIONS.ROUTES_BUILD);
  const canUpdateStop = can(session.role, PERMISSIONS.STOPS_UPDATE);

  const route = await loadRoute(params.routeId);
  if (!route) notFound();

  const deviceModels = canUpdateStop
    ? await prisma.deviceModel.findMany({
        select: { id: true, manufacturer: true, modelName: true },
        orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
        take: 200,
      })
    : [];

  const routeOpen =
    route.status === RouteStatus.DRAFT ||
    route.status === RouteStatus.PLANNED ||
    route.status === RouteStatus.IN_PROGRESS;
  const reorderAllowed =
    canReorder &&
    (route.status === RouteStatus.DRAFT ||
      route.status === RouteStatus.PLANNED);

  const activeStops = route.stops.filter(
    (s) => !TERMINAL_STOP_STATUSES.includes(s.status),
  );
  const doneStops = route.stops.filter((s) =>
    TERMINAL_STOP_STATUSES.includes(s.status),
  );
  // reorderRoute requires every stop id exactly once, so reorder
  // swaps operate on the full sequence-ordered id list and only the
  // positions of two ACTIVE stops trade places.
  const fullStopIds = route.stops.map((s) => s.id);
  const activePositions = route.stops
    .map((s, i) => (TERMINAL_STOP_STATUSES.includes(s.status) ? -1 : i))
    .filter((i) => i >= 0);
  // Open the stop the technician should work next: the first one
  // that is already moving (en route / arrived), else the first
  // scheduled one.
  const defaultOpenId =
    activeStops.find(
      (s) =>
        s.status === JobStatus.EN_ROUTE || s.status === JobStatus.ARRIVED,
    )?.id ??
    activeStops[0]?.id ??
    null;

  return (
    <>
      <PageHeader
        title={`Route ${route.date.toISOString().slice(0, 10)}`}
        subtitle={`${route.assignee.name} · ${route.stops.length} stop${route.stops.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <RouteStatusPill status={route.status} />
            <Link
              href={`/scheduling/routes/${route.id}/print`}
              target="_blank"
              className="rounded border border-surface-border px-3 py-1.5 text-sm transition hover:border-accent"
            >
              Print sheet
            </Link>
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
      {searchParams?.ok && (
        <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {searchParams.ok}
        </div>
      )}

      <div className="mb-6 grid gap-3 rounded-lg border border-surface-border bg-surface-muted/60 p-4 sm:grid-cols-4">
        <VehicleMeta
          routeId={route.id}
          current={route.vehicleRef ?? null}
          editable={canReorder && routeOpen}
        />
        <Meta label="Technician" value={route.assignee.name} />
        <Meta
          label="Optimizer"
          value={
            route.optimizerName
              ? humaniseOptimizerName(route.optimizerName)
              : "—"
          }
        />
        <Meta
          label="Progress"
          value={`${doneStops.length} of ${route.stops.length} stops done`}
        />
      </div>

      {route.stops.length === 0 ? (
        <div className="rounded border border-surface-border bg-surface-muted/40 p-6 text-center text-sm text-slate-400">
          This route has no stops yet. Add stops from the{" "}
          <Link
            href={`/scheduling/routes/new`}
            className="text-accent hover:underline"
          >
            route builder
          </Link>{" "}
          or from the ready-to-schedule groups on{" "}
          <Link href="/scheduling" className="text-accent hover:underline">
            Scheduling
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="mb-4">
            <RouteMap
              stops={route.stops.map((s) => ({
                id: s.id,
                sequence: s.sequence,
                label: s.job.school.name,
                sublabel: s.job.school.code ?? undefined,
                latitude: s.job.school.address?.latitude ?? null,
                longitude: s.job.school.address?.longitude ?? null,
              }))}
              title="Route map · auto-optimized by nearest-neighbor haversine distance"
              mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null}
            />
          </div>

          {activeStops.length === 0 ? (
            <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              All stops on this route are wrapped up — nothing left to
              do here.
            </div>
          ) : (
            <>
              <h2 className="mb-2 text-sm font-semibold text-slate-200">
                Stops to work{" "}
                <span className="font-normal text-slate-400">
                  — tap a stop to open it; only one opens at a time
                </span>
              </h2>
              <StopAccordion defaultOpenId={defaultOpenId}>
                {activeStops.map((stop, idx) => {
                  const pos = activePositions[idx]!;
                  const prevPos = idx > 0 ? activePositions[idx - 1]! : null;
                  const nextPos =
                    idx < activePositions.length - 1
                      ? activePositions[idx + 1]!
                      : null;
                  return (
                    <StopAccordionItem
                      key={stop.id}
                      stopId={stop.id}
                      header={<StopSummary stop={stop} />}
                    >
                      <StopBody
                        stop={stop}
                        routeId={route.id}
                        technicianName={route.assignee.name}
                        canUpdateStop={canUpdateStop}
                        routeOpen={routeOpen}
                        deviceModels={deviceModels}
                        reorder={
                          reorderAllowed
                            ? {
                                upOrder:
                                  prevPos != null
                                    ? swap(fullStopIds, pos, prevPos)
                                    : null,
                                downOrder:
                                  nextPos != null
                                    ? swap(fullStopIds, pos, nextPos)
                                    : null,
                              }
                            : null
                        }
                      />
                    </StopAccordionItem>
                  );
                })}
              </StopAccordion>
            </>
          )}

          {doneStops.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-slate-200">
                Completed stops{" "}
                <span className="font-normal text-slate-400">
                  ({doneStops.length})
                </span>
              </h2>
              <ul className="space-y-2">
                {doneStops.map((stop) => (
                  <li
                    key={stop.id}
                    data-testid="route-stop-done"
                    data-stop-id={stop.id}
                  >
                    <details className="rounded-lg border border-surface-border bg-surface-muted/30">
                      <summary className="flex cursor-pointer select-none items-center gap-2 p-3 text-sm text-slate-300 hover:text-white">
                        <StopSummary stop={stop} muted />
                      </summary>
                      <div className="border-t border-surface-border p-4 pt-3">
                        <StopBody
                          stop={stop}
                          routeId={route.id}
                          technicianName={route.assignee.name}
                          canUpdateStop={canUpdateStop}
                          routeOpen={routeOpen}
                          deviceModels={deviceModels}
                          reorder={null}
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
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
          <ConfirmButton
            message="Cancel this route? Stops go back to unscheduled and the assigned technician is notified."
            className="rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-500/30"
          >
            Cancel route
          </ConfirmButton>
        </form>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stop summary (always-visible accordion row) + full body
// ---------------------------------------------------------------------------

function StopSummary({ stop, muted = false }: { stop: StopRow; muted?: boolean }) {
  const activeDevices = stop.stopDevices.filter((d) => d.removedAt == null);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-border text-xs font-medium tracking-tight">
        {stop.sequence}
      </span>
      <span className={`truncate text-sm font-semibold ${muted ? "text-slate-300" : ""}`}>
        {stop.job.school.name}
      </span>
      {stop.job.school.code && (
        <span className="text-xs font-medium tracking-tight text-slate-500">
          {stop.job.school.code}
        </span>
      )}
      <span className="rounded bg-surface-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
        {humanise(stop.job.type)}
      </span>
      <span className="text-xs text-slate-400">
        {activeDevices.length} device{activeDevices.length === 1 ? "" : "s"}
      </span>
      {stop.delayedAt && (
        <span
          className="rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
          title={stop.delayNote ?? undefined}
        >
          Delayed — {stop.delayReason ? humanise(stop.delayReason) : "see note"}
          {stop.delayMinutes ? ` (+${stop.delayMinutes}m)` : ""}
        </span>
      )}
      {stop.status === JobStatus.FAILED && stop.failureReason && (
        <span
          className="rounded border border-red-500/50 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-200"
          title="Reason the driver recorded when failing this stop"
        >
          {stop.failureReason}
        </span>
      )}
      <span className="ml-auto">
        <StopStatusPill status={stop.status} />
      </span>
    </div>
  );
}

function StopBody({
  stop,
  routeId,
  technicianName,
  canUpdateStop,
  routeOpen,
  deviceModels,
  reorder,
}: {
  stop: StopRow;
  routeId: string;
  technicianName: string;
  canUpdateStop: boolean;
  routeOpen: boolean;
  deviceModels: { id: string; manufacturer: string; modelName: string }[];
  reorder: { upOrder: string[] | null; downOrder: string[] | null } | null;
}) {
  const school = stop.job.school;
  const address = school.address;
  const contact = school.mainContact ?? school.contacts[0] ?? null;
  const activeDevices = stop.stopDevices.filter((d) => d.removedAt == null);
  const pickupCount = activeDevices.filter((d) => d.purpose === "PICKUP").length;
  const deliveryCount = activeDevices.filter(
    (d) => d.purpose === "DELIVERY",
  ).length;
  const topPriority = stop.job.ticketLinks
    .map((tl) => tl.ticket.priority)
    .sort((a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a])[0] as
    | TicketPriority
    | undefined;
  const terminal = TERMINAL_STOP_STATUSES.includes(stop.status);
  const returnTo = `/scheduling/routes/${routeId}`;

  const checklistItems =
    activeDevices.length > 0
      ? activeDevices.map((sd) => ({
          id: sd.id,
          // Round-20 — real check-off: each line submits its
          // StopDevice id as confirmedDeviceIds; the server refuses
          // completion until every active line is confirmed.
          deviceId: sd.id,
          label: `${sd.purpose === "DELIVERY" ? "Deliver" : "Pick up"} ${
            sd.device.assetTag ?? sd.device.serialNumber
          }${
            sd.device.model
              ? ` — ${sd.device.model.manufacturer} ${sd.device.model.modelName}`
              : ""
          }`,
        }))
      : [
          {
            id: "work-done",
            deviceId: null,
            label: `${humanise(stop.job.type)} work at ${school.name} is done`,
          },
        ];

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ Stop facts */}
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Address
          </div>
          {address ? (
            <div className="mt-0.5 text-slate-200">
              <div>{address.line1}</div>
              {address.line2 && <div>{address.line2}</div>}
              <div>
                {address.city}, {address.state} {address.postalCode}
              </div>
            </div>
          ) : (
            <div className="mt-0.5 text-slate-500">
              No address on file — add one under Admin → Schools so the
              map and driving order can use this stop.
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            School contact
          </div>
          {contact ? (
            <div className="mt-0.5 text-slate-200">
              <div>
                {contact.name}
                {contact.title && (
                  <span className="text-slate-400"> · {contact.title}</span>
                )}
              </div>
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="block text-accent hover:underline"
                >
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="block truncate text-accent hover:underline"
                >
                  {contact.email}
                </a>
              )}
            </div>
          ) : (
            <div className="mt-0.5 text-slate-500">
              No contact on file for this school.
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Required action
          </div>
          <div className="mt-0.5 text-slate-200">
            {pickupCount > 0 && (
              <div>
                Pick up {pickupCount} device{pickupCount === 1 ? "" : "s"}
              </div>
            )}
            {deliveryCount > 0 && (
              <div>
                Deliver {deliveryCount} device{deliveryCount === 1 ? "" : "s"}
              </div>
            )}
            {pickupCount === 0 && deliveryCount === 0 && (
              <div>{humanise(stop.job.type)} — see tickets below</div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Priority · technician
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-slate-200">
            {topPriority ? <PriorityPill priority={topPriority} /> : "—"}
            <span className="text-slate-400">·</span>
            <span>{technicianName}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Timing
          </div>
          <div className="mt-0.5 text-slate-200">
            {stop.job.windowStart || stop.job.windowEnd ? (
              <div>
                Window:{" "}
                {stop.job.windowStart ? (
                  <LocalTime date={stop.job.windowStart} mode="datetime" />
                ) : (
                  "…"
                )}{" "}
                –{" "}
                {stop.job.windowEnd ? (
                  <LocalTime date={stop.job.windowEnd} mode="datetime" />
                ) : (
                  "…"
                )}
              </div>
            ) : (
              <div className="text-slate-500">No time window set</div>
            )}
            {stop.arrivedAt && (
              <div>
                Arrived <LocalTime date={stop.arrivedAt} mode="datetime" />
              </div>
            )}
            {stop.delayedAt && (
              <div className="text-amber-300">
                Running about {stop.delayMinutes ?? "?"} min late —{" "}
                {stop.delayReason ? humanise(stop.delayReason) : "see note"}
                {stop.delayNote && (
                  <span className="text-amber-200/80"> · {stop.delayNote}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Proof required
          </div>
          <div className="mt-0.5 text-slate-200">
            Photo of the devices + school-contact signature before
            completing.
          </div>
        </div>
        {(stop.job.notes || school.notes) && (
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              Notes
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-slate-200">
              {[stop.job.notes, school.notes].filter(Boolean).join("\n")}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------ Tickets */}
      {stop.job.ticketLinks.length > 0 && (
        <div className="border-t border-surface-border pt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
            Tickets on this stop
          </div>
          <ul className="space-y-0.5 text-xs text-slate-300">
            {stop.job.ticketLinks.map((tl) => (
              <li key={tl.ticket.id} className="flex items-center gap-2">
                <Link
                  href={`/tickets/${tl.ticket.incidentNumber}`}
                  className="font-medium tracking-tight text-accent hover:underline"
                >
                  {tl.ticket.incidentNumber}
                </Link>
                <StatePill state={tl.ticket.state} />
                <PriorityPill priority={tl.ticket.priority} />
                <span className="truncate text-slate-400">
                  {tl.ticket.shortDescription}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------ Status + reorder */}
      {(canUpdateStop || reorder) && !terminal && (
        <div className="flex flex-wrap gap-2 border-t border-surface-border pt-3">
          {canUpdateStop && routeOpen && (
            <StopStatusControls
              stopId={stop.id}
              routeId={routeId}
              current={stop.status}
            />
          )}
          {reorder?.upOrder && (
            <ReorderButton
              routeId={routeId}
              orderedStopIds={reorder.upOrder}
              label="↑ Move up"
            />
          )}
          {reorder?.downOrder && (
            <ReorderButton
              routeId={routeId}
              orderedStopIds={reorder.downOrder}
              label="↓ Move down"
            />
          )}
        </div>
      )}

      {/* ------------------------------------------------ Delay (Round-20) */}
      {canUpdateStop && routeOpen && !terminal && (
        <details
          className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs"
          data-testid="report-delay"
        >
          <summary className="cursor-pointer select-none font-semibold text-amber-200">
            Running late? Report a delay
          </summary>
          <form
            action={reportStopDelayAction}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="stopId" value={stop.id} />
            <input type="hidden" name="routeId" value={routeId} />
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Reason
              </span>
              <select
                name="reason"
                required
                className="rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
              >
                {Object.values(StopDelayReason).map((r) => (
                  <option key={r} value={r}>
                    {humanise(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Late by (min)
              </span>
              <input
                type="number"
                name="minutes"
                min={5}
                max={480}
                defaultValue={30}
                required
                className="w-20 rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Note (optional)
              </span>
              <input
                type="text"
                name="note"
                maxLength={500}
                placeholder="e.g. bridge closed on Fordham Rd"
                className="rounded border border-surface-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded border border-amber-500/60 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              Record delay & notify school
            </button>
          </form>
          <p className="mt-2 text-[11px] text-slate-500">
            The arrival estimate moves by the minutes entered and the
            school&apos;s contact gets an email when the delay rule is
            enabled in Admin → Email rules.
          </p>
        </details>
      )}

      {/* ------------------------------------------------ Devices */}
      {(stop.stopDevices.length > 0 || (canUpdateStop && routeOpen && !terminal)) && (() => {
        // Round-8 §1D — split active vs removed counts so operators
        // can tell at a glance which rows are live vs tombstoned.
        const activeCount = activeDevices.length;
        const removedCount = stop.stopDevices.length - activeCount;
        return (
          <div className="border-t border-surface-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] tracking-wide text-slate-400">
                Devices on this stop ({activeCount} active
                {removedCount > 0 && <> · {removedCount} removed</>})
              </div>
            </div>
            {stop.stopDevices.length > 0 && (
              <ul className="mb-2 space-y-1 text-xs">
                {stop.stopDevices.map((sd) => (
                  <li
                    key={sd.id}
                    className={`flex flex-wrap items-center gap-2 rounded border border-surface-border bg-surface px-2 py-1 ${
                      sd.removedAt ? "opacity-50" : ""
                    }`}
                  >
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        sd.purpose === "DELIVERY"
                          ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                          : "border border-sky-400/40 bg-sky-500/15 text-sky-100"
                      }`}
                      title={`Per-line ${sd.purpose === "DELIVERY" ? "delivery" : "pickup"} intent`}
                    >
                      {sd.purpose === "DELIVERY" ? "Delivery" : "Pickup"}
                    </span>
                    <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-slate-200">
                      {sd.device.assetTag ?? sd.device.serialNumber}
                    </code>
                    {sd.device.model && (
                      <span className="text-[10px] text-slate-500">
                        {sd.device.model.manufacturer}{" "}
                        {sd.device.model.modelName}
                      </span>
                    )}
                    {sd.ticket && (
                      <>
                        <Link
                          href={`/tickets/${sd.ticket.incidentNumber}`}
                          className="whitespace-nowrap text-accent hover:underline"
                        >
                          {sd.ticket.incidentNumber}
                        </Link>
                        {sd.ticket.source === TicketSource.ROUTE_PICKUP && (
                          <span
                            className="rounded border border-violet-400/40 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100"
                            title="Synthetic ticket — created on the route, not yet linked to a SNOW incident."
                          >
                            SYN
                          </span>
                        )}
                        <StatePill state={sd.ticket.state} />
                        {sd.ticket.mergedFrom &&
                          sd.ticket.mergedFrom.length > 0 && (
                            <span
                              className="text-[10px] italic text-slate-500"
                              title="This device was originally added to a synthetic ticket that has since been linked to this INC."
                            >
                              merged from{" "}
                              {sd.ticket.mergedFrom
                                .map((m) => m.incidentNumber)
                                .join(", ")}
                              {sd.ticket.mergedFrom[0]?.closedAt
                                ? ` ${sd.ticket.mergedFrom[0].closedAt
                                    .toISOString()
                                    .slice(0, 10)}`
                                : ""}
                            </span>
                          )}
                      </>
                    )}
                    {sd.removedAt ? (
                      <span className="ml-auto text-[10px] text-slate-500">
                        removed {sd.removedAt.toISOString().slice(0, 10)}
                      </span>
                    ) : (
                      canUpdateStop &&
                      routeOpen &&
                      !terminal && (
                        <form
                          action={removeDeviceFromStopAction}
                          className="ml-auto flex items-center gap-1"
                        >
                          <input
                            type="hidden"
                            name="stopDeviceId"
                            value={sd.id}
                          />
                          <input
                            type="text"
                            name="reason"
                            required
                            minLength={3}
                            maxLength={500}
                            placeholder="Reason (required)"
                            title="A reason is required to remove a device from a stop"
                            className="w-40 rounded border border-surface-border bg-surface-muted px-1 py-0.5 text-[10px] focus:border-accent focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-500/20"
                            title="Remove this device from the stop (reason required)"
                          >
                            × Remove
                          </button>
                        </form>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canUpdateStop && routeOpen && !terminal && (() => {
              // The form's purpose select defaults to the job's
              // natural type (PICKUP/DELIVERY) so the common case is
              // one click. Operators overriding for a missed-pickup-
              // during-delivery (or vice versa) flip it explicitly.
              const defaultPurpose =
                stop.job.type === "DELIVERY" ? "DELIVERY" : "PICKUP";
              return (
                <details className="rounded border border-surface-border bg-surface-muted/40 p-2 text-xs">
                  <summary className="cursor-pointer select-none text-accent hover:underline">
                    + Add device
                  </summary>
                  <div className="mt-3 grid gap-2">
                    <form
                      action={addDeviceToStopAction}
                      className="grid gap-2 rounded border border-surface-border bg-surface p-2 sm:grid-cols-[max-content_1fr_max-content]"
                    >
                      <input type="hidden" name="stopId" value={stop.id} />
                      <input type="hidden" name="kind" value="placeholder" />
                      <span className="self-center text-[10px] tracking-wide text-slate-400">
                        New device (placeholder)
                      </span>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          name="serial"
                          required
                          placeholder="Serial #"
                          className="rounded border border-surface-border bg-surface-muted px-2 py-1 focus:border-accent focus:outline-none"
                        />
                        <input
                          type="text"
                          name="assetTag"
                          placeholder="Asset tag (optional)"
                          className="rounded border border-surface-border bg-surface-muted px-2 py-1 focus:border-accent focus:outline-none"
                        />
                        <select
                          name="modelId"
                          required
                          className="rounded border border-surface-border bg-surface-muted px-2 py-1 focus:border-accent focus:outline-none"
                        >
                          <option value="">Model…</option>
                          {deviceModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.manufacturer} {m.modelName}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          name="condition"
                          placeholder="Condition / notes"
                          className="rounded border border-surface-border bg-surface-muted px-2 py-1 focus:border-accent focus:outline-none"
                        />
                        <select
                          name="purpose"
                          defaultValue={defaultPurpose}
                          title="Pickup or delivery for this individual device line"
                          className="rounded border border-surface-border bg-surface-muted px-2 py-1 focus:border-accent focus:outline-none"
                        >
                          <option value="PICKUP">Pickup</option>
                          <option value="DELIVERY">Delivery</option>
                        </select>
                        <input
                          type="text"
                          name="incidentNumber"
                          placeholder="Existing INC# (optional)"
                          pattern="[A-Za-z0-9\-]{3,40}"
                          title="Attach to a known incident number at this school. Leave blank to mint a synthetic SYN ticket."
                          className="rounded border border-surface-border bg-surface-muted px-2 py-1 focus:border-accent focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="self-center rounded bg-accent px-2 py-1 text-[10px] font-semibold hover:bg-accent-strong"
                      >
                        Add
                      </button>
                    </form>
                    <p className="text-[10px] text-slate-500">
                      Every device line gets a ticket. Type a known INC#
                      to attach an existing ticket; leave blank to mint a
                      synthetic ticket in &quot;Pending pickup (unlinked)&quot; —
                      link it later from{" "}
                      <Link
                        href="/duplicates"
                        className="text-accent hover:underline"
                      >
                        /duplicates
                      </Link>{" "}
                      once the SNOW incident posts. Use the
                      Pickup/Delivery toggle if a missed pickup is
                      discovered during a delivery (or vice versa).
                    </p>
                  </div>
                </details>
              );
            })()}
          </div>
        );
      })()}

      {/* ------------------------------------------------ Photos & proof */}
      {(stop.attachments.length > 0 || canUpdateStop) && (
        <div className="border-t border-surface-border pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
            Photos & proof for stop {stop.sequence} · {school.name} (
            {stop.attachments.length})
          </div>
          <AttachmentList
            attachments={stop.attachments}
            ownerKind="ROUTE_STOP"
            ownerId={stop.id}
            returnTo={returnTo}
            canWrite={canUpdateStop}
          />
          {canUpdateStop && (
            <div className="mt-3">
              <PhotoCapture
                action={uploadAttachmentAction}
                ownerKind="ROUTE_STOP"
                ownerId={stop.id}
                returnTo={returnTo}
              />
            </div>
          )}
          {canUpdateStop && !terminal && (
            <form
              action={uploadAttachmentAction}
              className="mt-3 space-y-2 rounded border border-surface-border bg-surface-muted/40 p-3"
            >
              <input type="hidden" name="kind" value="ROUTE_STOP" />
              <input type="hidden" name="routeStopId" value={stop.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SignaturePad
                name="signatureDataUrl"
                label={`Sign-off for ${school.name}`}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Signer&apos;s printed name (required)
                  </span>
                  <input
                    type="text"
                    name="signerName"
                    required
                    maxLength={120}
                    placeholder={contact?.name ?? "e.g. front-desk staff name"}
                    className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Note (optional)
                  </span>
                  <input
                    type="text"
                    name="note"
                    maxLength={500}
                    placeholder="e.g. left with main office"
                    className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="rounded bg-accent px-3 py-1.5 text-xs font-semibold hover:bg-accent-strong"
              >
                Save signature
              </button>
              <p className="text-[10px] text-slate-500">
                The signature, name, and timestamp attach to this stop and
                stay visible in the work record.
              </p>
            </form>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Completion */}
      {canUpdateStop && routeOpen && !terminal && (
        <StopCompletion
          action={updateStopStatusAction}
          stopId={stop.id}
          routeId={routeId}
          items={checklistItems}
          enabled={
            stop.status === JobStatus.EN_ROUTE ||
            stop.status === JobStatus.ARRIVED
          }
          disabledHint="Tap Start when you head to this stop, then Arrived on site — completing unlocks once you're moving."
          proofCount={stop.attachments.length}
        />
      )}
    </div>
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
      <div className="mt-0.5 font-medium tracking-tight text-sm text-slate-200">{value}</div>
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
  // "Complete" is intentionally absent — completing goes through the
  // StopCompletion check-off panel at the bottom of the stop.
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
                ? "bg-accent hover:bg-accent-strong"
                : "cursor-not-allowed border border-surface-border bg-surface text-slate-500"
            }`}
          >
            {b.label}
          </button>
        </form>
      ))}
      <form action={updateStopStatusAction} className="flex items-center gap-1">
        <input type="hidden" name="stopId" value={stopId} />
        <input type="hidden" name="status" value={JobStatus.FAILED} />
        <input type="hidden" name="routeId" value={routeId} />
        <input type="hidden" name="returnTo" value="route" />
        {/* The reason travels into the ticket transition + audit row,
            so "device not found — reschedule required" is traceable
            later, matching the legacy workflow's explicit status. */}
        <select
          name="reason"
          required
          defaultValue=""
          title="Why couldn't this stop be completed?"
          className="rounded border border-surface-border bg-surface px-1.5 py-1 text-[11px] focus:border-accent focus:outline-none"
        >
          <option value="" disabled>
            why failed…
          </option>
          <option value="Device not found — reschedule required">
            Device not found
          </option>
          <option value="School closed">School closed</option>
          <option value="Contact unavailable — nobody could sign">
            Contact unavailable
          </option>
          <option value="Access denied / turned away">
            Access denied
          </option>
          <option value="Other — see stop notes">Other</option>
        </select>
        <ConfirmButton
          message="Mark this stop as failed? The tickets go back to the reschedule queue (Awaiting pickup / Pending delivery) and dispatch sees the reason you picked."
          disabled={
            current === JobStatus.COMPLETED ||
            current === JobStatus.FAILED ||
            current === JobStatus.CANCELLED
          }
          className={`rounded px-2 py-1 text-xs font-semibold ${
            current !== JobStatus.COMPLETED &&
            current !== JobStatus.FAILED &&
            current !== JobStatus.CANCELLED
              ? "border border-red-500/60 bg-red-500/20 text-red-100 hover:bg-red-500/30"
              : "cursor-not-allowed border border-surface-border bg-surface text-slate-500"
          }`}
        >
          Fail
        </ConfirmButton>
      </form>
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
      className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${cls[status]}`}
    >
      {humanise(status)}
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

function humaniseOptimizerName(name: string): string {
  // Round-7 §2C — meta tile shows the optimizer name in title
  // case ("Nearest neighbor") instead of the kebab-case wire form
  // ("nearest-neighbor"). Mirrors the §2D /scheduling subline that
  // renders "optimized by nearest neighbor".
  const flat = name.replace(/[-_]/g, " ").trim();
  if (flat.length === 0) return name;
  return flat.charAt(0).toUpperCase() + flat.slice(1).toLowerCase();
}

function VehicleMeta({
  routeId,
  current,
  editable,
}: {
  routeId: string;
  current: string | null;
  editable: boolean;
}) {
  // Round-8 §1D — drivers need to record which van they took
  // without leaving the route detail page. The free-text field is
  // saved per-route via updateRouteVehicleAction; an audit row
  // lands on every change. The presented surface is intentionally
  // minimal — a structured Vehicle table is filed in the backlog.
  if (!editable) {
    return <Meta label="Vehicle" value={current ?? "—"} />;
  }
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        Vehicle
      </div>
      <form
        action={updateRouteVehicleAction}
        className="mt-0.5 flex items-center gap-2"
      >
        <input type="hidden" name="routeId" value={routeId} />
        <input
          type="text"
          name="vehicleRef"
          defaultValue={current ?? ""}
          placeholder="Van #, plate, etc."
          maxLength={80}
          className="flex-1 rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded border border-surface-border px-2 py-1 text-[10px] text-slate-300 hover:border-accent hover:text-white"
        >
          Save
        </button>
      </form>
    </div>
  );
}
