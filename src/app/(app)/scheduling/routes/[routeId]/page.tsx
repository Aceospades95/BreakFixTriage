import Link from "next/link";
import { notFound } from "next/navigation";
import { JobStatus, RouteStatus, TicketSource } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { RouteStatusPill } from "@/components/route-status-pill";
import { StatePill } from "@/components/state-pill";
import { AttachmentList } from "@/components/attachment-list";
import { RouteMap } from "@/components/route-map";
import { SignaturePad } from "@/components/signature-pad";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { humanise } from "@/lib/format";
import {
  cancelRouteAction,
  reorderRouteAction,
  updateRouteVehicleAction,
  updateStopStatusAction,
} from "@/server/actions/scheduling";
import {
  addDeviceToStopAction,
  removeDeviceFromStopAction,
} from "@/server/actions/stop-devices";
import { uploadAttachmentAction } from "@/server/actions/attachments";

export const dynamic = "force-dynamic";

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
                select: {
                  id: true,
                  name: true,
                  code: true,
                  address: { select: { latitude: true, longitude: true } },
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
  if (!route) notFound();

  const deviceModels = canUpdateStop
    ? await prisma.deviceModel.findMany({
        select: { id: true, manufacturer: true, modelName: true },
        orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
        take: 200,
      })
    : [];

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

      <div className="mb-6 grid gap-3 rounded-lg border border-surface-border bg-surface-muted/60 p-4 sm:grid-cols-3">
        <VehicleMeta
          routeId={route.id}
          current={route.vehicleRef ?? null}
          editable={canReorder && routeOpen}
        />
        <Meta
          label="Optimizer"
          value={
            route.optimizerName
              ? humaniseOptimizerName(route.optimizerName)
              : "—"
          }
        />
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
                data-testid="route-stop"
                data-stop-id={stop.id}
                className="rounded-lg border border-surface-border bg-surface-muted/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-border font-medium tracking-tight text-xs">
                        {stop.sequence}
                      </span>
                      <span>{stop.job.school.name}</span>
                      {stop.job.school.code && (
                        <span className="font-medium tracking-tight text-xs text-slate-500">
                          {stop.job.school.code}
                        </span>
                      )}
                      <span className="rounded bg-surface-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
                        {humanise(stop.job.type)}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
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

                {(stop.stopDevices.length > 0 || (canUpdateStop && routeOpen)) && (() => {
                  // Round-8 §1D — split active vs removed counts so
                  // operators can tell at a glance which rows are live
                  // vs tombstoned.
                  const activeCount = stop.stopDevices.filter(
                    (d) => d.removedAt == null,
                  ).length;
                  const removedCount = stop.stopDevices.length - activeCount;
                  return (
                  <div className="mt-3 border-t border-surface-border pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[10px] tracking-wide text-slate-400">
                        Devices on this stop ({activeCount} active
                        {removedCount > 0 && (
                          <> · {removedCount} removed</>
                        )}
                        )
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
                              canUpdateStop && routeOpen && (
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

                    {canUpdateStop && routeOpen && (() => {
                      // The form's purpose select defaults to the
                      // job's natural type (PICKUP/DELIVERY) so the
                      // common case is one click. Operators
                      // overriding for a missed-pickup-during-delivery
                      // (or vice versa) flip it explicitly.
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
                            Every device line gets a ticket. Type a
                            known INC# to attach an existing
                            ticket; leave blank to mint a synthetic
                            ticket in "Pending pickup (unlinked)" — link it
                            later from{" "}
                            <Link
                              href="/duplicates"
                              className="text-accent hover:underline"
                            >
                              /duplicates
                            </Link>{" "}
                            once the SNOW incident posts. Use the
                            Pickup/Delivery toggle if a missed pickup
                            is discovered during a delivery (or vice
                            versa).
                          </p>
                        </div>
                      </details>
                      );
                    })()}
                  </div>
                  );
                })()}

                {(stop.attachments.length > 0 || canUpdateStop) && (
                  <div className="mt-3 border-t border-surface-border pt-3">
                    <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
                      Photos & proof ({stop.attachments.length})
                    </div>
                    <AttachmentList
                      attachments={stop.attachments}
                      ownerKind="ROUTE_STOP"
                      ownerId={stop.id}
                      returnTo={`/scheduling/routes/${route.id}`}
                      canWrite={canUpdateStop}
                    />
                    {canUpdateStop && (
                      <form
                        action={uploadAttachmentAction}
                        className="mt-3 space-y-2 rounded border border-surface-border bg-surface-muted/40 p-3"
                      >
                        <input type="hidden" name="kind" value="ROUTE_STOP" />
                        <input
                          type="hidden"
                          name="routeStopId"
                          value={stop.id}
                        />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={`/scheduling/routes/${route.id}`}
                        />
                        <SignaturePad
                          name="signatureDataUrl"
                          label="School contact signature"
                        />
                        <button
                          type="submit"
                          className="rounded bg-accent px-3 py-1.5 text-xs font-semibold hover:bg-accent-strong"
                        >
                          Save signature
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          </ol>
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
