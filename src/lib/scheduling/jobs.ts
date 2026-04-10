import {
  JobStatus,
  JobType,
  RouteStatus,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket } from "@/lib/workflow";
import { getOptimizer, type Stop } from "@/lib/routing/optimizer";

export interface CreateJobInput {
  type: JobType;
  schoolId: string;
  ticketIds: string[];
  windowStart?: Date;
  windowEnd?: Date;
  notes?: string;
  actorUserId: string;
}

/**
 * Create a job covering one or more tickets at a single school. Does not
 * assign the job to a route — that is a separate step (see buildRoute).
 *
 * Callers are responsible for ensuring all ticketIds are in a state that
 * makes sense for the job type.
 */
export async function createJob(
  input: CreateJobInput,
  db: PrismaClient = defaultPrisma,
) {
  if (input.ticketIds.length === 0) {
    throw new Error("createJob requires at least one ticketId");
  }
  return db.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        type: input.type,
        schoolId: input.schoolId,
        status: JobStatus.UNSCHEDULED,
        windowStart: input.windowStart ?? null,
        windowEnd: input.windowEnd ?? null,
        notes: input.notes ?? null,
        ticketLinks: {
          create: input.ticketIds.map((tid) => ({ ticketId: tid })),
        },
      },
    });
    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Job",
        entityId: job.id,
        action: "create",
        after: {
          type: input.type,
          schoolId: input.schoolId,
          ticketIds: input.ticketIds,
        },
      },
      tx,
    );
    return job;
  });
}

export interface BuildRouteInput {
  date: Date;
  assigneeUserId: string;
  jobIds: string[];
  vehicleRef?: string;
  actorUserId: string;
}

/**
 * Build a Route from a set of unscheduled jobs. Runs the configured
 * optimizer over the job school coordinates, creates RouteStops in the
 * optimized order, and transitions each involved ticket to
 * PICKUP_SCHEDULED or DELIVERY_SCHEDULED where applicable.
 */
export async function buildRoute(
  input: BuildRouteInput,
  db: PrismaClient = defaultPrisma,
) {
  if (input.jobIds.length === 0)
    throw new Error("buildRoute requires at least one job");

  const optimizer = getOptimizer();

  return db.$transaction(async (tx) => {
    const jobs = await tx.job.findMany({
      where: { id: { in: input.jobIds } },
      include: {
        school: { include: { address: true } },
        ticketLinks: true,
      },
    });
    if (jobs.length !== input.jobIds.length) {
      throw new Error("One or more jobIds not found");
    }

    const stops: Stop[] = jobs
      .filter((j) => j.school.address?.latitude && j.school.address?.longitude)
      .map((j) => ({
        id: j.id,
        latitude: j.school.address!.latitude!,
        longitude: j.school.address!.longitude!,
      }));

    let orderedJobIds: string[];
    if (stops.length === jobs.length) {
      const result = await optimizer.optimize({ origin: null, stops });
      orderedJobIds = result.orderedStopIds;
    } else {
      // Fallback: stable original order if any stop is missing coordinates.
      orderedJobIds = jobs.map((j) => j.id);
    }

    const route = await tx.route.create({
      data: {
        date: input.date,
        assigneeUserId: input.assigneeUserId,
        vehicleRef: input.vehicleRef ?? null,
        status: RouteStatus.PLANNED,
        optimizerName: optimizer.name,
        optimizedAt: new Date(),
        stops: {
          create: orderedJobIds.map((jobId, idx) => ({
            jobId,
            sequence: idx + 1,
            status: JobStatus.SCHEDULED,
          })),
        },
      },
      include: { stops: true },
    });

    // Move jobs to SCHEDULED
    await tx.job.updateMany({
      where: { id: { in: orderedJobIds } },
      data: { status: JobStatus.SCHEDULED },
    });

    // For each ticket on each job, fire the appropriate transition.
    for (const job of jobs) {
      const targetState =
        job.type === JobType.PICKUP
          ? "PICKUP_SCHEDULED"
          : job.type === JobType.DELIVERY
            ? "DELIVERY_SCHEDULED"
            : null;
      if (!targetState) continue;
      for (const link of job.ticketLinks) {
        try {
          await transitionTicket(
            link.ticketId,
            targetState,
            {
              actorUserId: input.actorUserId,
              reason: `Scheduled via route ${route.id}`,
              payload: { jobId: job.id, routeId: route.id },
            },
            tx,
          );
        } catch (err) {
          // Log but do not fail the whole route build — some tickets may
          // already be past this state (e.g. another delivery scheduled).
          await writeAudit(
            {
              actorUserId: input.actorUserId,
              entityType: "Ticket",
              entityId: link.ticketId,
              action: "schedule:skipped",
              after: {
                reason: err instanceof Error ? err.message : String(err),
                jobId: job.id,
                routeId: route.id,
              },
            },
            tx,
          );
        }
      }
    }

    await writeAudit(
      {
        actorUserId: input.actorUserId,
        entityType: "Route",
        entityId: route.id,
        action: "build",
        after: {
          date: input.date.toISOString(),
          assigneeUserId: input.assigneeUserId,
          orderedJobIds,
          optimizer: optimizer.name,
        },
      },
      tx,
    );

    return route;
  });
}
