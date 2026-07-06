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
import { StopWorkPanel } from "@/components/stop-work-panel";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";
import {
  describeProofRule,
  isProofSatisfied,
  proofPresence,
} from "@/lib/scheduling/stop-lines";
import { getRoadRoute } from "@/lib/routing/road";
import { isOutOfWarranty } from "@/lib/warranty";
import { WarrantyChip } from "@/components/warranty-chip";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import { DRIVER_ROLES } from "@/lib/scheduling/driver-roles";
import {
  cancelRouteAction,
  reorderRouteAction,
  reportStopDelayAction,
  updateRouteVehicleAction,
  updateStopStatusAction,
  reassignRouteDriverAction,
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
                  // Round-22 (demo) — surfaces the out-of-warranty
                  // badge on pickup lines so we stop collecting
                  // devices we'd just have to send back.
                  warrantyExpires: true,
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
  JobStatus.PARTIAL,
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
  const canReassignDriver = can(session.role, PERMISSIONS.SCHEDULING_WRITE);

  const route = await loadRoute(params.routeId);
  if (!route) notFound();

  const deviceModels = canUpdateStop
    ? await prisma.deviceModel.findMany({
        select: { id: true, manufacturer: true, modelName: true },
        orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
        take: 200,
      })
    : [];

  // Jorge's June-18 notes — swap the runner when a driver is absent.
  const driverOptions = canReassignDriver
    ? await prisma.user.findMany({
        where: { active: true, role: { in: DRIVER_ROLES } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
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

  // Round-22 §1E — the audit strip on completed/failed stops shows who
  // wrapped it up and when. Fetch the latest status-transition audit row
  // per terminal stop (first match per stop = most recent).
  const terminalStopIds = doneStops.map((s) => s.id);
  const stopAudits =
    terminalStopIds.length > 0
      ? await prisma.auditLog.findMany({
          where: {
            entityType: "RouteStop",
            entityId: { in: terminalStopIds },
            action: { startsWith: "status:" },
          },
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { name: true } } },
        })
      : [];
  const auditByStop = new Map<string, (typeof stopAudits)[number]>();
  for (const a of stopAudits) {
    if (!auditByStop.has(a.entityId)) auditByStop.set(a.entityId, a);
  }

  // Round-22 §2/§1E — a route whose stops all wrapped up but with a
  // failure or partial reads "Completed with issues", not a clean
  // "Completed".
  const routeHasIssues = route.stops.some(
    (s) => s.status === JobStatus.FAILED || s.status === JobStatus.PARTIAL,
  );

  // Round-22 §3 — real road geometry + drive times when a routing
  // provider is configured; null → the map shows a labeled straight-line
  // approximation. Bounded + best-effort, never blocks the render.
  const orderedCoords = route.stops
    .map((s) => s.job.school.address)
    .filter(
      (a): a is NonNullable<typeof a> =>
        a?.latitude != null && a?.longitude != null,
    )
    .map((a) => ({ latitude: a.latitude!, longitude: a.longitude! }));
  const road = await getRoadRoute(orderedCoords);
  const roadRoute = road
    ? { legs: road.legs, totalKm: road.totalKm, totalMin: road.totalMin }
    : null;

  return (
    <>
      <PageHeader
        title={`Route ${route.date.toISOString().slice(0, 10)}`}
        subtitle={`${route.assignee.name} · ${route.stops.length} stop${route.stops.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            {route.status === RouteStatus.COMPLETED && routeHasIssues ? (
              <span
                className="rounded border border-orange-500/50 bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-200"
                title="The route is done, but at least one stop failed or was only partially completed."
              >
                Completed with issues
              </span>
            ) : (
              <RouteStatusPill status={route.status} />
            )}
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
        {canReassignDriver && routeOpen ? (
          // Jorge's June-18 notes — one-select driver swap for absent
          // drivers. Both the old and new driver get notified; the
          // change is audited.
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              Technician
            </div>
            <form
              action={reassignRouteDriverAction}
              className="mt-0.5 flex min-w-0 max-w-full flex-wrap items-center gap-1.5"
              data-testid="reassign-driver-form"
            >
              <input type="hidden" name="routeId" value={route.id} />
              <select
                name="assigneeUserId"
                defaultValue={route.assignee.id}
                aria-label="Route driver"
                className="min-w-0 max-w-full rounded border border-surface-border bg-surface px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
              >
                {driverOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({humanise(u.role)})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="text-[10px] text-accent hover:underline"
                title="Hand this route to a different driver — both drivers are notified"
              >
                reassign
              </button>
            </form>
          </div>
        ) : (
          <Meta label="Technician" value={route.assignee.name} />
        )}
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
              title="Route map · stops in suggested driving order"
              mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null}
              roadRoute={roadRoute}
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
                        completionAudit={null}
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
                Resolved stops{" "}
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
                          completionAudit={auditByStop.get(stop.id) ?? null}
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
        <ActionForm
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
              required
              minLength={3}
              maxLength={500}
              placeholder="Reason (required)"
              className="rounded border border-surface-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <ConfirmButton
            message="Cancel this route? Stops go back to unscheduled and the assigned technician is notified."
            className="rounded border border-red-500/60 bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-500/30"
          >
            Cancel route
          </ConfirmButton>
        </ActionForm>
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
  completionAudit,
  reorder,
}: {
  stop: StopRow;
  routeId: string;
  technicianName: string;
  canUpdateStop: boolean;
  routeOpen: boolean;
  deviceModels: { id: string; manufacturer: string; modelName: string }[];
  completionAudit: {
    createdAt: Date;
    actor: { name: string } | null;
  } | null;
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

  // Round-22 §1C — line items the on-site panel verifies. Each line is an
  // active StopDevice (pre-populated from the job's tickets, or added on
  // site); the label names the ticket and the device when one is recorded.
  const panelLines = activeDevices.map((sd) => {
    const deviceLabel = sd.device
      ? `${sd.device.assetTag ?? sd.device.serialNumber}${
          sd.device.model
            ? ` — ${sd.device.model.manufacturer} ${sd.device.model.modelName}`
            : ""
        }`
      : "device to be recorded on pickup";
    const inc = sd.ticket?.incidentNumber;
    return {
      id: sd.id,
      purpose: (sd.purpose === "DELIVERY" ? "DELIVERY" : "PICKUP") as
        | "PICKUP"
        | "DELIVERY",
      label: inc ? `${inc} · ${deviceLabel}` : deviceLabel,
      // Round-22 (demo) — warn before collecting a device we'd have
      // to send back. Pickup lines only: on a delivery line the
      // repaired device is going BACK to the school, and telling the
      // driver not to collect it reads as "don't deliver this".
      outOfWarranty:
        sd.purpose !== "DELIVERY" &&
        isOutOfWarranty(sd.device?.warrantyExpires),
    };
  });

  // Round-22 §1D — proof presence drives the gate + the strip.
  const proofPresent = proofPresence(
    stop.attachments.map((a) => ({
      mimeType: a.mimeType,
      signerName: a.signerName,
    })),
  );

  // Unresolved lines (not collected/delivered) on a terminal stop are
  // what re-queued — surface them with links (1E).
  const unresolvedLines = activeDevices.filter(
    (sd) =>
      sd.lineState === "NOT_FOUND" || sd.lineState === "REFUSED",
  );

  return (
    <div className="space-y-4">
      {/* ----------------------------------------- Completion record (1E) */}
      {terminal && (
        <StopAuditStrip
          stop={stop}
          completionAudit={completionAudit}
          proofPresent={proofPresent}
          unresolvedLines={unresolvedLines}
        />
      )}

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
            {describeProofRule(stop.proofRule)}
          </div>
        </div>
        {(stop.job.notes || school.notes || stop.notes) && (
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              Notes
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-slate-200">
              {[stop.job.notes, school.notes, stop.notes]
                .filter(Boolean)
                .join("\n")}
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
          <ActionForm
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
            <label className="flex items-center gap-2 text-xs text-amber-100">
              <input
                type="checkbox"
                name="notifyDownstream"
                className="h-4 w-4 accent-[rgb(var(--color-primary))]"
              />
              Also notify later stops on this route
            </label>
            <button
              type="submit"
              className="rounded border border-amber-500/60 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              Record delay & notify school
            </button>
          </ActionForm>
          <p className="mt-2 text-[11px] text-slate-500">
            The arrival estimate moves by the minutes entered and the
            school&apos;s contact gets an email when the delay rule is
            enabled in Admin → Email rules. Ticking &quot;notify later
            stops&quot; pushes their estimates too and emails their
            SPOCs with a heads-up (separate template you can edit).
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
                      {sd.device?.assetTag ??
                        sd.device?.serialNumber ??
                        "device pending"}
                    </code>
                    <LineStateBadge state={sd.lineState} />
                    {isOutOfWarranty(sd.device?.warrantyExpires) && (
                      <WarrantyChip
                        warrantyExpires={sd.device!.warrantyExpires}
                        compact
                      />
                    )}
                    {sd.device?.model && (
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
                        <ActionForm
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
                        </ActionForm>
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
                    <ActionForm
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
                          required
                          placeholder="Ticket number (required)"
                          pattern="[A-Za-z0-9\-]{3,40}"
                          title="Every pickup needs a ticket number. If the school just created the ticket, ask them for the incident number — the app checks it belongs to this school."
                          className="rounded border border-surface-border bg-surface-muted px-2 py-1 focus:border-accent focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="self-center rounded bg-accent px-2 py-1 text-[10px] font-semibold hover:bg-accent-strong"
                      >
                        Add
                      </button>
                    </ActionForm>
                    <p className="text-[10px] text-slate-500">
                      Use this for a device you find on site that wasn&apos;t
                      on the list. Every pickup needs a ticket number — if the
                      school just created the ticket, ask them for the
                      incident number and type it in. If the number isn&apos;t
                      in the app yet (fresh ServiceNow tickets arrive with the
                      next import), the device is still tracked and links up
                      automatically once the import lands. Flip the
                      Pickup/Delivery toggle if you&apos;re collecting a
                      device during a delivery (or vice versa).
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
            <ActionForm
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
                  {/* Round-22 §1D — prefill the contact's name as a real
                      value (not a placeholder that looks filled-in but
                      isn't), so the required field doesn't spring a native
                      "please fill this in" surprise on a field that reads
                      as complete. The tech edits it if someone else signs. */}
                  <input
                    type="text"
                    name="signerName"
                    required
                    maxLength={120}
                    defaultValue={contact?.name ?? ""}
                    placeholder="Name of the person signing"
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
            </ActionForm>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Completion (1C/1D) */}
      {canUpdateStop && routeOpen && !terminal && (
        <StopWorkPanel
          action={updateStopStatusAction}
          stopId={stop.id}
          routeId={routeId}
          lines={panelLines}
          proofRule={stop.proofRule}
          proofPresent={proofPresent}
          enabled={stop.status === JobStatus.ARRIVED}
          disabledHint="Tap Start when you head out, then Arrived on site — the checklist unlocks once you're on site."
          initialNotes={stop.notes}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completion record strip (Round-22 §1E)
// ---------------------------------------------------------------------------

/**
 * Inline audit strip on a completed / partial / failed stop: who wrapped
 * it up and when, the item outcomes, proof status (flagged when overridden
 * or absent), the sign-off name, notes, and links to any tickets that
 * were returned to Ready to Schedule. All from data already on the record.
 */
function StopAuditStrip({
  stop,
  completionAudit,
  proofPresent,
  unresolvedLines,
}: {
  stop: StopRow;
  completionAudit: { createdAt: Date; actor: { name: string } | null } | null;
  proofPresent: { photo: boolean; signature: boolean };
  unresolvedLines: StopRow["stopDevices"];
}) {
  const active = stop.stopDevices.filter((d) => d.removedAt == null);
  const counts = {
    verified: active.filter(
      (l) => l.lineState === "VERIFIED" || l.lineState === "EXTRA_ADDED",
    ).length,
    notFound: active.filter((l) => l.lineState === "NOT_FOUND").length,
    refused: active.filter((l) => l.lineState === "REFUSED").length,
  };
  const itemSummary = [
    counts.verified > 0 ? `${counts.verified} verified` : null,
    counts.notFound > 0 ? `${counts.notFound} not found` : null,
    counts.refused > 0 ? `${counts.refused} refused` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const signer = stop.attachments.find((a) => a.signerName)?.signerName ?? null;
  const proofOverridden = !!stop.proofOverrideReason;
  const proofOk =
    isProofSatisfied(stop.proofRule, proofPresent) || proofOverridden;

  const tone =
    stop.status === JobStatus.COMPLETED
      ? "border-emerald-500/40 bg-emerald-500/5"
      : stop.status === JobStatus.PARTIAL
        ? "border-orange-500/40 bg-orange-500/5"
        : "border-red-500/40 bg-red-500/5";

  // Tickets returned to Ready to Schedule: the whole stop on FAILED, the
  // unresolved lines on PARTIAL.
  const requeued =
    stop.status === JobStatus.FAILED
      ? stop.job.ticketLinks.map((tl) => tl.ticket)
      : unresolvedLines
          .map((l) => l.ticket)
          .filter((t): t is NonNullable<typeof t> => t != null);

  return (
    <div className={`rounded-lg border p-3 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StopStatusPill status={stop.status} />
        {completionAudit && (
          <span className="text-slate-300">
            by {completionAudit.actor?.name ?? "system"} ·{" "}
            <LocalTime date={completionAudit.createdAt} mode="datetime" />
          </span>
        )}
        {itemSummary && <span className="text-slate-400">· {itemSummary}</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
        <span>
          Proof:{" "}
          {proofOverridden ? (
            <span className="font-semibold text-amber-300">
              overridden — {stop.proofOverrideReason}
            </span>
          ) : proofOk ? (
            <span className="text-emerald-300">
              {[
                proofPresent.photo ? "photo" : null,
                proofPresent.signature ? "signature" : null,
              ]
                .filter(Boolean)
                .join(" + ") || "attached"}
            </span>
          ) : (
            <span className="font-semibold text-amber-300">none attached</span>
          )}
        </span>
        {signer && <span>· Signed by {signer}</span>}
      </div>

      {stop.status === JobStatus.FAILED && stop.failureReason && (
        <div className="mt-1 text-red-200">Reason: {stop.failureReason}</div>
      )}
      {stop.notes && (
        <div className="mt-1 whitespace-pre-wrap text-slate-400">
          Notes: {stop.notes}
        </div>
      )}

      {requeued.length > 0 && (
        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">
          {requeued.length} ticket{requeued.length === 1 ? "" : "s"} returned to
          Ready to Schedule:{" "}
          {requeued.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <Link
                href={`/tickets/${t.incidentNumber}`}
                className="font-medium underline hover:text-amber-100"
              >
                {t.incidentNumber}
              </Link>
            </span>
          ))}{" "}
          <Link
            href="/scheduling"
            className="font-medium underline hover:text-amber-100"
          >
            → reschedule
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function LineStateBadge({ state }: { state: StopRow["stopDevices"][number]["lineState"] }) {
  if (state === "EXPECTED") return null;
  const cls: Record<string, string> = {
    VERIFIED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    EXTRA_ADDED: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    NOT_FOUND: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    REFUSED: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls[state] ?? ""}`}
    >
      {humanise(state)}
    </span>
  );
}

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
        <ActionForm key={b.to} action={updateStopStatusAction}>
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
        </ActionForm>
      ))}
      <ActionForm
        action={updateStopStatusAction}
        className="flex items-center gap-1"
      >
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
      </ActionForm>
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
    <ActionForm action={reorderRouteAction}>
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
    </ActionForm>
  );
}

function StopStatusPill({ status }: { status: JobStatus }) {
  const cls: Record<JobStatus, string> = {
    UNSCHEDULED: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    SCHEDULED: "bg-indigo-500/20 text-indigo-200 border-indigo-500/40",
    EN_ROUTE: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    ARRIVED: "bg-amber-500/20 text-amber-200 border-amber-500/40",
    COMPLETED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    PARTIAL: "bg-orange-500/20 text-orange-200 border-orange-500/40",
    FAILED: "bg-red-500/20 text-red-200 border-red-500/40",
    CANCELLED: "bg-slate-500/20 text-slate-200 border-slate-500/40",
  };
  const label = status === JobStatus.ARRIVED ? "On site" : humanise(status);
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${cls[status]}`}
    >
      {label}
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
      <ActionForm
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
      </ActionForm>
    </div>
  );
}
