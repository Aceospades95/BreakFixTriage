"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { JobStatus, JobType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { dispatchEmailEvent } from "@/lib/email";
import { buildRoute, createJob } from "@/lib/scheduling/jobs";
import { cancelRoute, reorderRoute } from "@/lib/scheduling/routes";
import { updateStopStatus } from "@/lib/scheduling/stops";

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
 * quick "Create pickup job" forms on the scheduling dashboard.
 */
export async function createJobAction(formData: FormData) {
  const session = await requireRole(PERMISSIONS.SCHEDULING_WRITE);

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
    redirect(`/scheduling?error=${encodeURIComponent(errorMessage)}`);
  }

  revalidatePath("/scheduling");
  revalidatePath("/scheduling/routes/new");
  redirect("/scheduling");
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

    // Round-7 §3B — fire delivery_scheduled for every DELIVERY job
    // on the new route, once per attached ticket. dispatchEmailEvent
    // is the chokepoint; an admin EmailRule with notifyOnEnter=true
    // delivers the email.
    try {
      const deliveryStops = await prisma.routeStop.findMany({
        where: { routeId: route.id, job: { type: JobType.DELIVERY } },
        include: {
          job: {
            select: {
              ticketLinks: { select: { ticketId: true } },
              schoolId: true,
            },
          },
        },
      });
      for (const stop of deliveryStops) {
        for (const link of stop.job.ticketLinks) {
          await dispatchEmailEvent("delivery_scheduled", {
            ticketId: link.ticketId,
            schoolId: stop.job.schoolId,
            routeId: route.id,
            actorUserId: session.userId,
            variables: {
              ticketId: link.ticketId,
              routeId: route.id,
              date: parsed.data.date,
            },
          });
        }
      }
    } catch (dispatchErr) {
      console.error(
        `[buildRouteAction] delivery_scheduled dispatch failed for route ${route.id}:`,
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
    redirect(`/scheduling/routes/${newRouteId}`);
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
            await dispatchEmailEvent("pickup_completed", {
              ticketId: link.ticketId,
              schoolId: stop.job.schoolId,
              actorUserId: session.userId,
              variables: {
                ticketId: link.ticketId,
                stopId: parsed.data.stopId,
              },
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
    redirect(`${fallbackPath}?error=${encodeURIComponent(errorMessage)}`);
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
