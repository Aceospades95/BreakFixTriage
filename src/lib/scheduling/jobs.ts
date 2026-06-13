import {
  JobStatus,
  JobType,
  ProofRule,
  RouteStatus,
  StopDevicePurpose,
  StopLineState,
  type PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/audit";
import { transitionTicket } from "@/lib/workflow";
import { getOptimizer, type Stop } from "@/lib/routing/optimizer";
import {
  enqueueNotification,
  renderDeliveryScheduled,
  renderPickupScheduled,
} from "@/lib/notifications";

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
        school: {
          include: { address: true, mainContact: true },
        },
        ticketLinks: { include: { ticket: true } },
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

    const jobById = new Map(jobs.map((j) => [j.id, j]));
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
            // Round-22 §1D — deliveries need a signed hand-off; pickups
            // need a photo of what was collected. Set the enforceable
            // proof rule per job type at build time.
            proofRule:
              jobById.get(jobId)?.type === JobType.DELIVERY
                ? ProofRule.PHOTO_AND_SIGNATURE
                : ProofRule.PHOTO,
          })),
        },
      },
      include: { stops: true },
    });

    // Round-22 §1C — pre-populate one stop line item per expected ticket
    // so the technician sees exactly what to pick up / drop off the
    // moment they arrive, instead of a stop that reads "0 devices".
    // A pickup ticket may not have a device linked yet (it is collected
    // on the visit); such a line carries the ticket with deviceId null
    // until the device is recorded on site.
    const stopByJobId = new Map(route.stops.map((s) => [s.jobId, s.id]));
    for (const job of jobs) {
      const stopId = stopByJobId.get(job.id);
      if (!stopId) continue;
      const purpose =
        job.type === JobType.DELIVERY
          ? StopDevicePurpose.DELIVERY
          : StopDevicePurpose.PICKUP;
      for (const link of job.ticketLinks) {
        await tx.stopDevice.create({
          data: {
            stopId,
            ticketId: link.ticketId,
            deviceId: link.ticket.deviceId ?? null,
            purpose,
            lineState: StopLineState.EXPECTED,
            addedByUserId: input.actorUserId,
          },
        });
      }
    }

    // Move jobs to SCHEDULED
    await tx.job.updateMany({
      where: { id: { in: orderedJobIds } },
      data: { status: JobStatus.SCHEDULED },
    });

    // For each ticket on each job, fire the appropriate transition
    // and (best-effort) queue an email to the school main contact.
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

        const contact = job.school.mainContact;
        if (contact?.email && contact.email.includes("@")) {
          const rendered =
            job.type === JobType.DELIVERY
              ? renderDeliveryScheduled({
                  incidentNumber: link.ticket.incidentNumber,
                  schoolName: job.school.name,
                  deliveryDate: input.date,
                  contactName: contact.name ?? null,
                })
              : renderPickupScheduled({
                  incidentNumber: link.ticket.incidentNumber,
                  schoolName: job.school.name,
                  pickupDate: input.date,
                  contactName: contact.name ?? null,
                });
          try {
            await enqueueNotification(
              {
                kind:
                  job.type === JobType.DELIVERY
                    ? "DELIVERY_SCHEDULED"
                    : "PICKUP_SCHEDULED",
                ticketId: link.ticketId,
                recipientEmail: contact.email,
                subject: rendered.subject,
                body: rendered.body,
              },
              tx,
            );
          } catch (err) {
            await writeAudit(
              {
                actorUserId: input.actorUserId,
                entityType: "Ticket",
                entityId: link.ticketId,
                action: "schedule:notify-skip",
                after: {
                  reason: err instanceof Error ? err.message : String(err),
                  routeId: route.id,
                },
              },
              tx,
            );
          }
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
