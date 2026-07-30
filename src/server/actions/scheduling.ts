"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  JobStatus,
  JobType,
  StopDelayReason,
  StopLineState,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { dispatchEmailEvent } from "@/lib/email";
import { buildTicketEmailVariables } from "@/lib/email/variables";
import { writeAudit } from "@/lib/audit/audit";
import { buildRoute, createJob } from "@/lib/scheduling/jobs";
import {
  andJobWhere,
  andTicketWhere,
  jobWhereForSession,
  schoolWhereForSession,
  ticketWhereForSession,
} from "@/lib/data/forSession";
import {
  cancelRoute,
  reassignRouteDriver,
  reorderRoute,
} from "@/lib/scheduling/routes";
import {
  StopUpdateRefusedError,
  updateStopStatus,
  type StopLineResolution,
} from "@/lib/scheduling/stops";
import { withFeedback } from "@/lib/url";
import { humanise } from "@/lib/format";

// ---------------------------------------------------------------------------
// createJobAction
// ---------------------------------------------------------------------------

const createJobSchema = z.object({
  type: z.nativeEnum(JobType),
  schoolId: z.string().min(1, "schoolId is required"),
  ticketIds: z.array(z.string().min(1)).min(1, "pick at least one ticket"),
  notes: z.string().max(1000).optional(),
});

/**
 * Create a single job covering one school + N tickets. Called from the
 * quick "Create pickup job" forms on the scheduling dashboard and the
 * inline ready-ticket groups on the route builder.
 *
 * Round-17 — `returnTo=builder` sends the operator to
 * /scheduling/routes/new after creation. The field QA finding was
 * that creating a job from /scheduling bounced back to the same page
 * with nothing visibly different, so operators concluded the button
 * did nothing; the builder is where the flow continues.
 */
export async function createJobAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_WRITE);
  const returnTo =
    formData.get("returnTo")?.toString() === "builder"
      ? "/scheduling/routes/new"
      : "/scheduling";

  const ticketIds = formData
    .getAll("ticketIds")
    .map((v) => v.toString())
    .filter(Boolean);

  const parsed = createJobSchema.safeParse({
    type: formData.get("type"),
    schoolId: formData.get("schoolId"),
    ticketIds,
    notes: formData.get("notes")?.toString().trim() || undefined,
  });

  if (!parsed.success) {
    redirect(
      `/scheduling?error=${encodeURIComponent(
        parsed.error.issues.map((i) => i.message).join("; "),
      )}`,
    );
  }

  // Tenant scoped per ADR 0014 — schoolId and ticketIds arrive from
  // the form, so a dispatcher could otherwise stage work at any
  // school in the city and attach any district's tickets to it.
  const schoolScope = schoolWhereForSession(session);
  if (Object.keys(schoolScope).length > 0) {
    const school = await prisma.school.findFirst({
      where: { AND: [schoolScope, { id: parsed.data.schoolId }] },
      select: { id: true },
    });
    if (!school) {
      redirect(
        withFeedback(returnTo, "error", "That school is not available to you."),
      );
    }
    if (parsed.data.ticketIds.length > 0) {
      const visible = await prisma.ticket.count({
        where: andTicketWhere(ticketWhereForSession(session), {
          id: { in: parsed.data.ticketIds },
        }),
      });
      if (visible !== parsed.data.ticketIds.length) {
        redirect(
          withFeedback(
            returnTo,
            "error",
            "Some of those tickets are not available to you.",
          ),
        );
      }
    }
  }

  let errorMessage: string | null = null;
  try {
    await createJob({
      type: parsed.data.type,
      schoolId: parsed.data.schoolId,
      ticketIds: parsed.data.ticketIds,
      notes: parsed.data.notes,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to create job";
  }

  if (errorMessage) {
    redirect(withFeedback(returnTo, "error", errorMessage));
  }

  revalidatePath("/scheduling");
  revalidatePath("/scheduling/routes/new");
  redirect(
    withFeedback(returnTo, "ok", 
      "Job created — pick a driver below and save to finish the route.",
    ),
  );
}

// ---------------------------------------------------------------------------
// previewRouteAction (Round-22 §3.3) — optimize WITHOUT saving
// ---------------------------------------------------------------------------

export interface RoutePreview {
  ok: boolean;
  error?: string;
  stops: {
    id: string;
    sequence: number;
    label: string;
    sublabel: string | null;
    latitude: number | null;
    longitude: number | null;
  }[];
  /** True when the optimizer reordered the stops vs the input order. */
  changed: boolean;
  /** Plain-language note of what optimization did. */
  summary: string;
  roadRoute: {
    legs: { distanceKm: number; durationMin: number }[];
    totalKm: number;
    totalMin: number;
  } | null;
}

/**
 * Round-22 §3.3 — compute the optimized stop order + map data + estimated
 * duration for a candidate route WITHOUT persisting anything. Drives the
 * route-builder preview step that sits between "optimize" and "save".
 */
export async function previewRouteAction(
  formData: FormData,
): Promise<RoutePreview> {
  const session = await requireRole(PERMISSIONS.ROUTES_BUILD);
  const empty: RoutePreview = {
    ok: false,
    stops: [],
    changed: false,
    summary: "",
    roadRoute: null,
  };

  const jobIds = formData
    .getAll("jobIds")
    .map((v) => v.toString())
    .filter(Boolean);
  if (jobIds.length === 0) {
    return { ...empty, error: "Pick at least one stop to preview." };
  }

  const { getOptimizer } = await import("@/lib/routing/optimizer");
  const { getRoadRoute } = await import("@/lib/routing/road");

  // Tenant scoped per ADR 0014. jobIds come straight off the form, so
  // without this any ROUTES_BUILD holder could post another
  // district's job ids and preview (then build) a route over work
  // they cannot see. Out-of-scope ids simply do not resolve, so the
  // response is "not found", not "forbidden".
  const jobs = await prisma.job.findMany({
    where: andJobWhere(jobWhereForSession(session), { id: { in: jobIds } }),
    select: {
      id: true,
      school: {
        select: {
          name: true,
          code: true,
          address: { select: { latitude: true, longitude: true } },
        },
      },
    },
  });
  // Preserve the operator's input order for the "what changed" diff.
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const inputOrder = jobIds.filter((id) => byId.has(id));

  const withCoords = inputOrder
    .map((id) => byId.get(id)!)
    .filter(
      (j) =>
        j.school.address?.latitude != null &&
        j.school.address?.longitude != null,
    );

  let orderedIds = inputOrder;
  let changed = false;
  if (withCoords.length === inputOrder.length && inputOrder.length > 1) {
    const optimizer = getOptimizer();
    const result = await optimizer.optimize({
      origin: null,
      stops: inputOrder.map((id) => {
        const j = byId.get(id)!;
        return {
          id,
          latitude: j.school.address!.latitude!,
          longitude: j.school.address!.longitude!,
        };
      }),
    });
    orderedIds = result.orderedStopIds;
    changed = orderedIds.join(",") !== inputOrder.join(",");
  }

  const stops = orderedIds.map((id, idx) => {
    const j = byId.get(id)!;
    return {
      id,
      sequence: idx + 1,
      label: j.school.name,
      sublabel: j.school.code ?? null,
      latitude: j.school.address?.latitude ?? null,
      longitude: j.school.address?.longitude ?? null,
    };
  });

  const coords = stops
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({ latitude: s.latitude!, longitude: s.longitude! }));
  const road = await getRoadRoute(coords);
  const roadRoute = road
    ? { legs: road.legs, totalKm: road.totalKm, totalMin: road.totalMin }
    : null;

  const summary =
    inputOrder.length <= 1
      ? "Single stop — nothing to optimize."
      : withCoords.length < inputOrder.length
        ? "Some stops have no map coordinates, so the order is left as you picked it. Add lat/lng to those schools for an optimized sequence."
        : changed
          ? "Optimizer reordered the stops into a shorter driving sequence (shown below)."
          : "Your stop order is already the optimized sequence — no change.";

  return { ok: true, stops, changed, summary, roadRoute, error: undefined };
}

// ---------------------------------------------------------------------------
// buildRouteAction
// ---------------------------------------------------------------------------

const buildRouteSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  assigneeUserId: z.string().min(1, "assignee is required"),
  jobIds: z.array(z.string().min(1)).min(1, "pick at least one job"),
  vehicleRef: z.string().max(100).optional(),
});

export async function buildRouteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.ROUTES_BUILD);

  const jobIds = formData
    .getAll("jobIds")
    .map((v) => v.toString())
    .filter(Boolean);

  const parsed = buildRouteSchema.safeParse({
    date: formData.get("date"),
    assigneeUserId: formData.get("assigneeUserId"),
    jobIds,
    vehicleRef: formData.get("vehicleRef")?.toString().trim() || undefined,
  });

  if (!parsed.success) {
    redirect(
      `/scheduling/routes/new?error=${encodeURIComponent(
        parsed.error.issues.map((i) => i.message).join("; "),
      )}`,
    );
  }

  // Tenant scoped per ADR 0014 — the UI filter is not the control.
  // Every posted job id must resolve inside the actor's districts, or
  // the whole build is refused; silently dropping the out-of-scope
  // ones would build a route quietly missing stops the operator
  // believes they selected.
  const visibleJobs = await prisma.job.findMany({
    where: andJobWhere(jobWhereForSession(session), {
      id: { in: parsed.data.jobIds },
    }),
    select: { id: true },
  });
  if (visibleJobs.length !== parsed.data.jobIds.length) {
    redirect(
      `/scheduling/routes/new?error=${encodeURIComponent(
        "Some of those jobs are no longer available to you. Reload and try again.",
      )}`,
    );
  }

  let errorMessage: string | null = null;
  let newRouteId: string | null = null;
  try {
    const route = await buildRoute({
      // Anchor the date at UTC midnight so the Prisma @db.Date column gets a
      // consistent representation regardless of server timezone.
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      assigneeUserId: parsed.data.assigneeUserId,
      jobIds: parsed.data.jobIds,
      vehicleRef: parsed.data.vehicleRef,
      actorUserId: session.userId,
    });
    newRouteId = route.id;

    // Round-7 §3B + Round-20 — fire delivery_scheduled /
    // pickup_scheduled for every job on the new route, once per
    // attached ticket, so the SPOC hears we're coming either way.
    // dispatchEmailEvent is the chokepoint; an admin EmailRule
    // delivers the email.
    try {
      const allStops = await prisma.routeStop.findMany({
        where: { routeId: route.id },
        include: {
          job: {
            select: {
              type: true,
              ticketLinks: { select: { ticketId: true } },
              schoolId: true,
            },
          },
          route: {
            select: { assignee: { select: { name: true } } },
          },
        },
      });
      for (const stop of allStops) {
        const event =
          stop.job.type === JobType.DELIVERY
            ? ("delivery_scheduled" as const)
            : ("pickup_scheduled" as const);
        for (const link of stop.job.ticketLinks) {
          // Round-15 — the template interpolates {{ticket.*}},
          // {{stop.window}} and {{driver.name}}; the old flat-id
          // payload failed validation and never sent.
          const variables = await buildTicketEmailVariables(
            link.ticketId,
            prisma,
            {
              stop: { window: parsed.data.date },
              driver: { name: stop.route.assignee.name },
            },
          );
          if (!variables) continue;
          await dispatchEmailEvent(event, {
            ticketId: link.ticketId,
            schoolId: stop.job.schoolId,
            routeId: route.id,
            actorUserId: session.userId,
            variables,
          });
        }
      }
    } catch (dispatchErr) {
      console.error(
        `[buildRouteAction] scheduled-visit dispatch failed for route ${route.id}:`,
        dispatchErr,
      );
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to build route";
  }

  if (errorMessage) {
    redirect(
      `/scheduling/routes/new?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  revalidatePath("/scheduling");
  revalidatePath("/scheduling/routes/new");
  revalidatePath("/");
  if (newRouteId) {
    redirect(
      `/scheduling/routes/${newRouteId}?ok=${encodeURIComponent(
        "Route created. Stops are sequenced below — print the run sheet or hand it to the driver.",
      )}`,
    );
  }
  redirect("/scheduling");
}

// ---------------------------------------------------------------------------
// reorderRouteAction
// ---------------------------------------------------------------------------

const reorderRouteSchema = z.object({
  routeId: z.string().min(1),
  orderedStopIds: z.array(z.string().min(1)).min(1),
});

/**
 * Accepts an `orderedStopIds` array submitted as repeated form fields.
 * The scheduling detail page builds this from its manual-reorder controls.
 */
export async function reorderRouteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.ROUTES_BUILD);

  const orderedStopIds = formData
    .getAll("orderedStopIds")
    .map((v) => v.toString())
    .filter(Boolean);

  const parsed = reorderRouteSchema.safeParse({
    routeId: formData.get("routeId"),
    orderedStopIds,
  });

  if (!parsed.success) {
    const id = formData.get("routeId")?.toString() ?? "";
    redirect(
      `/scheduling/routes/${id}?error=${encodeURIComponent("Invalid reorder request")}`,
    );
  }

  let errorMessage: string | null = null;
  try {
    await reorderRoute({
      routeId: parsed.data.routeId,
      orderedStopIds: parsed.data.orderedStopIds,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Reorder failed";
  }

  if (errorMessage) {
    redirect(
      `/scheduling/routes/${parsed.data.routeId}?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  revalidatePath(`/scheduling/routes/${parsed.data.routeId}`);
  redirect(`/scheduling/routes/${parsed.data.routeId}`);
}

// ---------------------------------------------------------------------------
// updateStopStatusAction
// ---------------------------------------------------------------------------

const updateStopStatusSchema = z.object({
  stopId: z.string().min(1),
  status: z.nativeEnum(JobStatus),
  reason: z.string().max(500).optional(),
  returnTo: z.enum(["route", "my-day", "/"]).default("route"),
  routeId: z.string().optional(),
  proofOverrideReason: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Per-line resolutions arrive as repeated form fields:
 *   line:<stopDeviceId> = VERIFIED | NOT_FOUND | REFUSED
 *   lineNote:<stopDeviceId> = free text
 * Parse them into the StopLineResolution[] the lib expects.
 */
function parseLineResolutions(formData: FormData): StopLineResolution[] {
  const out: StopLineResolution[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("line:")) continue;
    const stopDeviceId = key.slice("line:".length);
    const state = value.toString();
    if (
      state !== StopLineState.VERIFIED &&
      state !== StopLineState.NOT_FOUND &&
      state !== StopLineState.REFUSED
    ) {
      continue;
    }
    const note = formData.get(`lineNote:${stopDeviceId}`)?.toString().trim();
    out.push({ stopDeviceId, state, note: note || undefined });
  }
  return out;
}

/**
 * Driver-facing (or dispatcher-on-behalf-of) stop status update. The
 * `returnTo` / `routeId` fields determine where to redirect after the
 * update so the UI stays on whichever page the form was submitted from.
 */
export async function updateStopStatusAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.STOPS_UPDATE);

  const parsed = updateStopStatusSchema.safeParse({
    stopId: formData.get("stopId"),
    status: formData.get("status"),
    reason: formData.get("reason")?.toString().trim() || undefined,
    returnTo: formData.get("returnTo") ?? "route",
    routeId: formData.get("routeId")?.toString() || undefined,
    proofOverrideReason:
      formData.get("proofOverrideReason")?.toString().trim() || undefined,
    notes: formData.get("notes")?.toString() ?? undefined,
  });

  if (!parsed.success) {
    redirect(`/scheduling?error=${encodeURIComponent("Invalid stop update")}`);
  }

  const fallbackPath =
    parsed.data.returnTo === "my-day" || parsed.data.returnTo === "/"
      ? "/"
      : parsed.data.routeId
        ? `/scheduling/routes/${parsed.data.routeId}`
        : "/scheduling";

  // Round-22 §1C/§1D — per-line resolutions + proof override. The
  // completion gate is enforced inside updateStopStatus's transaction
  // so a refused completion never leaves lines or proof half-applied.
  const lineResolutions = parseLineResolutions(formData);

  let resultStatus: JobStatus = parsed.data.status;
  let errorMessage: string | null = null;
  try {
    await updateStopStatus({
      stopId: parsed.data.stopId,
      status: parsed.data.status,
      actorUserId: session.userId,
      reason: parsed.data.reason,
      lineResolutions,
      proofOverrideReason: parsed.data.proofOverrideReason,
      notes: parsed.data.notes,
    });

    // Round-7 §3B — fire pickup_completed when a Pickup stop
    // transitions to COMPLETED. dispatchEmailEvent is the chokepoint.
    if (
      parsed.data.status === JobStatus.COMPLETED ||
      parsed.data.status === JobStatus.PARTIAL
    ) {
      try {
        const stop = await prisma.routeStop.findUnique({
          where: { id: parsed.data.stopId },
          include: {
            job: {
              select: {
                type: true,
                schoolId: true,
                ticketLinks: { select: { ticketId: true } },
              },
            },
          },
        });
        if (stop?.job.type === JobType.PICKUP) {
          for (const link of stop.job.ticketLinks) {
            // Round-15 — template interpolates {{ticket.*}} +
            // {{link}}; flat ids failed validation and never sent.
            const variables = await buildTicketEmailVariables(
              link.ticketId,
              prisma,
            );
            if (!variables) continue;
            await dispatchEmailEvent("pickup_completed", {
              ticketId: link.ticketId,
              schoolId: stop.job.schoolId,
              actorUserId: session.userId,
              variables,
            });
          }
        }
      } catch (dispatchErr) {
        console.error(
          `[updateStopStatusAction] pickup_completed dispatch failed for ${parsed.data.stopId}:`,
          dispatchErr,
        );
      }
    }
  } catch (err) {
    if (err instanceof StopUpdateRefusedError) {
      // Operator-fixable refusal (wrong order, unconfirmed devices,
      // concurrent edit) — surface the message verbatim.
      errorMessage = err.message;
    } else {
      // Unexpected failure (DB down, timeout, …). The transaction
      // rolled back, so nothing was saved — say exactly that instead
      // of leaking a driver/ORM error string.
      console.error(
        `[updateStopStatusAction] stop update failed for ${parsed.data.stopId}:`,
        err,
      );
      errorMessage =
        "Saving this stop failed and nothing was changed. Try again; if it keeps failing, reload the page.";
    }
  }

  if (errorMessage) {
    redirect(withFeedback(fallbackPath, "error", errorMessage));
  }

  revalidatePath(fallbackPath);
  revalidatePath("/scheduling");
  revalidatePath("/");

  // Round-22 §1E — after wrapping up a stop, jump to the next open stop
  // on the same route instead of dumping the technician back at the map.
  const isTerminal =
    resultStatus === JobStatus.COMPLETED ||
    resultStatus === JobStatus.PARTIAL ||
    resultStatus === JobStatus.FAILED;
  if (isTerminal && parsed.data.routeId) {
    const nextStop = await prisma.routeStop.findFirst({
      where: {
        routeId: parsed.data.routeId,
        status: {
          notIn: [
            JobStatus.COMPLETED,
            JobStatus.PARTIAL,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
          ],
        },
      },
      orderBy: { sequence: "asc" },
      select: { id: true },
    });
    const verb =
      resultStatus === JobStatus.COMPLETED
        ? "Stop completed"
        : resultStatus === JobStatus.PARTIAL
          ? "Stop saved as partial — unresolved items returned to Ready to Schedule"
          : "Stop failed — its tickets are back in Ready to Schedule";
    const base = `/scheduling/routes/${parsed.data.routeId}`;
    const target = nextStop ? `${base}#stop-${nextStop.id}` : base;
    redirect(
      withFeedback(
        target,
        "ok",
        nextStop ? `${verb}. Next stop is open below.` : `${verb}. Route done.`,
      ),
    );
  }

  redirect(fallbackPath);
}

// ---------------------------------------------------------------------------
// cancelRouteAction
// ---------------------------------------------------------------------------

const cancelRouteSchema = z.object({
  routeId: z.string().min(1),
  // Round-22 §4 — cancelling a route is destructive (stops unscheduled,
  // tech notified); require a reason so the audit trail explains why.
  reason: z
    .string()
    .trim()
    .min(3, "A reason is required to cancel a route")
    .max(500),
});

export async function cancelRouteAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.ROUTES_BUILD);

  const parsed = cancelRouteSchema.safeParse({
    routeId: formData.get("routeId"),
    reason: formData.get("reason")?.toString().trim() || undefined,
  });

  if (!parsed.success) {
    redirect(`/scheduling?error=${encodeURIComponent("Invalid cancel request")}`);
  }

  let errorMessage: string | null = null;
  try {
    await cancelRoute({
      routeId: parsed.data.routeId,
      reason: parsed.data.reason,
      actorUserId: session.userId,
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Cancel failed";
  }

  if (errorMessage) {
    redirect(
      `/scheduling/routes/${parsed.data.routeId}?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  revalidatePath("/scheduling");
  revalidatePath(`/scheduling/routes/${parsed.data.routeId}`);
  redirect("/scheduling");
}

// ---------------------------------------------------------------------------
// updateRouteVehicleAction (Round-8 §1D)
// ---------------------------------------------------------------------------

const updateRouteVehicleSchema = z.object({
  routeId: z.string().min(1),
  vehicleRef: z.string().trim().max(80).optional(),
});

/**
 * Round-8 §1D — driver-side inline editor for the route vehicle ref.
 * Drivers need to record which van they took without leaving the
 * route detail page. Writes an audit row so the change is traceable.
 */
export async function updateRouteVehicleAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_WRITE);

  const parsed = updateRouteVehicleSchema.safeParse({
    routeId: formData.get("routeId"),
    vehicleRef: formData.get("vehicleRef")?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/scheduling?error=${encodeURIComponent(
        parsed.error.issues[0]!.message,
      )}`,
    );
  }

  const existing = await prisma.route.findUnique({
    where: { id: parsed.data.routeId },
    select: { id: true, vehicleRef: true },
  });
  if (!existing) {
    redirect(
      `/scheduling?error=${encodeURIComponent("Route not found")}`,
    );
  }

  const next = parsed.data.vehicleRef ?? null;
  if (existing.vehicleRef !== next) {
    await prisma.route.update({
      where: { id: existing.id },
      data: { vehicleRef: next },
    });
    await writeAudit({
      actorUserId: session.userId,
      entityType: "Route",
      entityId: existing.id,
      action: "vehicle.updated",
      before: { vehicleRef: existing.vehicleRef },
      after: { vehicleRef: next },
      reason: `Vehicle ${existing.vehicleRef ?? "(none)"} → ${next ?? "(none)"}`,
    });
  }

  revalidatePath(`/scheduling/routes/${parsed.data.routeId}`);
  redirect(
    `/scheduling/routes/${parsed.data.routeId}?ok=${encodeURIComponent("Vehicle updated")}`,
  );
}

// ---------------------------------------------------------------------------
// reportStopDelayAction (Round-20 — NY team)
// ---------------------------------------------------------------------------

const reportStopDelaySchema = z.object({
  stopId: z.string().min(1),
  routeId: z.string().min(1),
  reason: z.nativeEnum(StopDelayReason),
  minutes: z.coerce.number().int().min(5).max(8 * 60),
  note: z.string().max(500).optional(),
  // Round-22 — also notify the SPOCs of LATER stops on the route
  // (their visit may slip too) and push their estimates.
  notifyDownstream: z.coerce.boolean().optional(),
});

/**
 * "Have a section where we mark if the delivery or pick up will be
 * delayed due to unexpected circumstances: Construction, Weather,
 * Vehicle Emergency, Delay from previous delivery, etc. Have this
 * information update the schedule and also provide an email to the
 * SPOC."
 *
 * Records the delay on the stop, pushes the arrival estimate by the
 * given minutes (when one exists), audits, and fires `stop_delayed`
 * through the email chokepoint for every ticket on the stop.
 */
export async function reportStopDelayAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.STOPS_UPDATE);

  const parsed = reportStopDelaySchema.safeParse({
    stopId: formData.get("stopId"),
    routeId: formData.get("routeId"),
    reason: formData.get("reason"),
    minutes: formData.get("minutes"),
    note: formData.get("note")?.toString().trim() || undefined,
    notifyDownstream: formData.get("notifyDownstream") === "on",
  });
  const fallbackPath = `/scheduling/routes/${formData.get("routeId")?.toString() ?? ""}`;
  if (!parsed.success) {
    redirect(
      withFeedback(
        fallbackPath,
        "error",
        parsed.error.issues.map((i) => i.message).join("; "),
      ),
    );
  }
  const routePath = `/scheduling/routes/${parsed.data.routeId}`;

  const stop = await prisma.routeStop.findUnique({
    where: { id: parsed.data.stopId },
    include: {
      job: {
        select: {
          type: true,
          schoolId: true,
          ticketLinks: { select: { ticketId: true } },
        },
      },
    },
  });
  if (!stop || stop.routeId !== parsed.data.routeId) {
    redirect(withFeedback(routePath, "error", "Stop not found on this route"));
  }
  if (
    stop.status === JobStatus.COMPLETED ||
    stop.status === JobStatus.FAILED ||
    stop.status === JobStatus.CANCELLED
  ) {
    redirect(
      withFeedback(routePath, "error", "This stop is already wrapped up — no delay to report."),
    );
  }

  await prisma.routeStop.update({
    where: { id: stop.id },
    data: {
      delayReason: parsed.data.reason,
      delayMinutes: parsed.data.minutes,
      delayNote: parsed.data.note ?? null,
      delayedAt: new Date(),
      arrivalEstimate: stop.arrivalEstimate
        ? new Date(stop.arrivalEstimate.getTime() + parsed.data.minutes * 60_000)
        : undefined,
    },
  });

  await writeAudit({
    actorUserId: session.userId,
    entityType: "RouteStop",
    entityId: stop.id,
    action: "delay-reported",
    after: {
      reason: parsed.data.reason,
      minutes: parsed.data.minutes,
      note: parsed.data.note ?? null,
      routeId: parsed.data.routeId,
    },
  });

  // SPOC notification per ticket on the stop. Failure to send must
  // not undo the recorded delay; failures land on the email log /
  // exceptions dashboard.
  let dispatched = 0;
  try {
    for (const link of stop.job.ticketLinks) {
      const variables = await buildTicketEmailVariables(link.ticketId, prisma, {
        delay: {
          reason: humanise(parsed.data.reason),
          minutes: parsed.data.minutes,
          note: parsed.data.note ?? "",
        },
        visit: {
          kind: stop.job.type === JobType.DELIVERY ? "delivery" : "pickup",
        },
      });
      if (!variables) continue;
      const sent = await dispatchEmailEvent("stop_delayed", {
        ticketId: link.ticketId,
        schoolId: stop.job.schoolId,
        routeId: parsed.data.routeId,
        actorUserId: session.userId,
        variables,
      });
      dispatched += sent.length;
    }
  } catch (dispatchErr) {
    console.error(
      `[reportStopDelayAction] stop_delayed dispatch failed for ${stop.id}:`,
      dispatchErr,
    );
  }

  // Round-22 — cascade to LATER stops on the route. Their estimates
  // slip by the same minutes, and (opt-in) their SPOCs hear about it
  // via the dedicated stop_delayed_downstream template.
  let downstreamCount = 0;
  if (parsed.data.notifyDownstream) {
    const laterStops = await prisma.routeStop.findMany({
      where: {
        routeId: parsed.data.routeId,
        sequence: { gt: stop.sequence },
        status: {
          notIn: [
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
          ],
        },
      },
      orderBy: { sequence: "asc" },
      include: {
        job: {
          select: {
            type: true,
            schoolId: true,
            ticketLinks: { select: { ticketId: true } },
          },
        },
      },
    });
    for (const later of laterStops) {
      // Push the estimate too (the schedule update the brief asked
      // for), only when an estimate exists.
      if (later.arrivalEstimate) {
        await prisma.routeStop.update({
          where: { id: later.id },
          data: {
            arrivalEstimate: new Date(
              later.arrivalEstimate.getTime() + parsed.data.minutes * 60_000,
            ),
          },
        });
      }
      try {
        for (const link of later.job.ticketLinks) {
          const variables = await buildTicketEmailVariables(
            link.ticketId,
            prisma,
            {
              delay: {
                reason: humanise(parsed.data.reason),
                minutes: parsed.data.minutes,
                note: "",
              },
              visit: {
                kind: later.job.type === JobType.DELIVERY ? "delivery" : "pickup",
              },
            },
          );
          if (!variables) continue;
          const sent = await dispatchEmailEvent("stop_delayed_downstream", {
            ticketId: link.ticketId,
            schoolId: later.job.schoolId,
            routeId: parsed.data.routeId,
            actorUserId: session.userId,
            variables,
          });
          downstreamCount += sent.length;
        }
      } catch (dispatchErr) {
        console.error(
          `[reportStopDelayAction] downstream dispatch failed for ${later.id}:`,
          dispatchErr,
        );
      }
    }
  }

  revalidatePath(routePath);
  revalidatePath("/scheduling");
  revalidatePath("/");
  const downstreamNote = parsed.data.notifyDownstream
    ? ` Later stops on the route were updated${downstreamCount > 0 ? ` and ${downstreamCount} downstream contact(s) emailed` : ""}.`
    : "";
  redirect(
    withFeedback(
      routePath,
      "ok",
      `Delay recorded — ${humanise(parsed.data.reason)}, about ${parsed.data.minutes} minutes.${dispatched > 0 ? " The school contact has been emailed." : " No SPOC email rule is enabled, so nothing was sent."}${downstreamNote}`,
    ),
  );
}

const reassignDriverSchema = z.object({
  routeId: z.string().min(1),
  assigneeUserId: z.string().min(1, "Pick a driver"),
});

/**
 * Jorge's June-18 notes — swap the runner on an existing route when
 * the scheduled driver is out. Wraps the audited service in
 * src/lib/scheduling/routes.ts; both drivers get notified.
 */
export async function reassignRouteDriverAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_WRITE);

  const parsed = reassignDriverSchema.safeParse({
    routeId: formData.get("routeId"),
    assigneeUserId: formData.get("assigneeUserId"),
  });
  if (!parsed.success) {
    redirect(
      `/scheduling?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`,
    );
  }

  let summary: string;
  try {
    const result = await reassignRouteDriver({
      routeId: parsed.data.routeId,
      newAssigneeUserId: parsed.data.assigneeUserId,
      actorUserId: session.userId,
    });
    summary = result.changed
      ? `Route handed to ${result.newDriver.name} (was ${result.oldDriver.name}) — they've been notified`
      : `${result.newDriver.name} already runs this route`;
  } catch (err) {
    redirect(
      `/scheduling/routes/${parsed.data.routeId}?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Could not reassign the route",
      )}`,
    );
  }

  revalidatePath(`/scheduling/routes/${parsed.data.routeId}`);
  revalidatePath("/scheduling");
  revalidatePath("/scheduling/calendar");
  revalidatePath("/me/schedule");
  redirect(
    `/scheduling/routes/${parsed.data.routeId}?ok=${encodeURIComponent(summary)}`,
  );
}
