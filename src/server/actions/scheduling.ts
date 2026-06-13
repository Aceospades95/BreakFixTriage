"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { JobStatus, JobType, StopDelayReason } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { dispatchEmailEvent } from "@/lib/email";
import { buildTicketEmailVariables } from "@/lib/email/variables";
import { writeAudit } from "@/lib/audit/audit";
import { buildRoute, createJob } from "@/lib/scheduling/jobs";
import { cancelRoute, reorderRoute } from "@/lib/scheduling/routes";
import { updateStopStatus } from "@/lib/scheduling/stops";
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
});

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

  // Round-20 — NY team: "we should have to select what we are
  // picking up." Completing a stop requires every ACTIVE device
  // line to be explicitly confirmed; the confirmation is stamped
  // on the StopDevice row as the durable field check-off.
  if (parsed.data.status === JobStatus.COMPLETED) {
    const confirmedIds = new Set(
      formData.getAll("confirmedDeviceIds").map((v) => v.toString()),
    );
    const activeLines = await prisma.stopDevice.findMany({
      where: { stopId: parsed.data.stopId, removedAt: null },
      select: {
        id: true,
        purpose: true,
        device: { select: { assetTag: true, serialNumber: true } },
      },
    });
    const missing = activeLines.filter((l) => !confirmedIds.has(l.id));
    if (missing.length > 0) {
      const label = missing
        .map((l) => l.device.assetTag ?? l.device.serialNumber)
        .slice(0, 3)
        .join(", ");
      redirect(
        withFeedback(
          fallbackPath,
          "error",
          `Confirm every device before completing the stop — ${missing.length} unconfirmed (${label}${missing.length > 3 ? ", …" : ""}). Check each line off, or remove it from the stop with a reason.`,
        ),
      );
    }
    if (activeLines.length > 0) {
      await prisma.stopDevice.updateMany({
        where: {
          stopId: parsed.data.stopId,
          removedAt: null,
          confirmedAt: null,
        },
        data: { confirmedAt: new Date(), confirmedByUserId: session.userId },
      });
    }
  }

  let errorMessage: string | null = null;
  try {
    await updateStopStatus({
      stopId: parsed.data.stopId,
      status: parsed.data.status,
      actorUserId: session.userId,
      reason: parsed.data.reason,
    });

    // Round-7 §3B — fire pickup_completed when a Pickup stop
    // transitions to COMPLETED. dispatchEmailEvent is the chokepoint.
    if (parsed.data.status === JobStatus.COMPLETED) {
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
    errorMessage = err instanceof Error ? err.message : "Stop update failed";
  }

  if (errorMessage) {
    redirect(withFeedback(fallbackPath, "error", errorMessage));
  }

  revalidatePath(fallbackPath);
  revalidatePath("/scheduling");
  revalidatePath("/");
  redirect(fallbackPath);
}

// ---------------------------------------------------------------------------
// cancelRouteAction
// ---------------------------------------------------------------------------

const cancelRouteSchema = z.object({
  routeId: z.string().min(1),
  reason: z.string().max(500).optional(),
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
