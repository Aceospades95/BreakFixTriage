import type { Prisma, PrismaClient } from "@prisma/client";

export type DuplicateDetection =
  | { kind: "NONE" }
  | { kind: "INCIDENT_CONFLICT"; existingTicketId: string }
  | { kind: "SERIAL_ON_CLOSED"; existingTicketId: string }
  | { kind: "SERIAL_OPEN_MATCH"; existingTicketId: string };

export interface DetectInput {
  incidentNumber: string;
  serialNumber?: string;
  /**
   * The school the incoming row is assigned to. Not used by the default
   * policy but reserved for future heuristics (e.g. "same serial at a
   * different school = physical transfer, not a reopen").
   */
  schoolId: string;
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Decide what kind of relationship (if any) exists between an incoming row
 * and the current ticket set. The caller decides what to *do* with the
 * result; this function has no side effects.
 *
 * Policy (kept deliberately simple and testable):
 *
 * 1. If a ticket with the same incidentNumber exists AND it is not CLOSED,
 *    treat the incoming row as a straightforward update candidate — return
 *    NONE (the pipeline will UPSERT it).
 *
 * 2. If a ticket with the same incidentNumber exists AND it is CLOSED, we
 *    report INCIDENT_CONFLICT so the operator can resolve it in the queue
 *    (reopen vs. new vs. ignore).
 *
 * 3. If there's no incidentNumber match but a serialNumber match exists on
 *    a CLOSED ticket, flag SERIAL_ON_CLOSED → caller creates a reopen
 *    candidate.
 *
 * 4. If there's a serial match on a ticket that is still open, flag
 *    SERIAL_OPEN_MATCH → operator reviews in queue.
 */
export async function detectDuplicates(
  db: PrismaLike,
  input: DetectInput,
): Promise<DuplicateDetection> {
  const byIncident = await db.ticket.findUnique({
    where: { incidentNumber: input.incidentNumber },
  });

  if (byIncident) {
    if (byIncident.state === "CLOSED") {
      return { kind: "INCIDENT_CONFLICT", existingTicketId: byIncident.id };
    }
    // existing but non-closed: updater path, not a conflict
    return { kind: "NONE" };
  }

  if (input.serialNumber) {
    const device = await db.device.findUnique({
      where: { serialNumber: input.serialNumber },
      select: { id: true },
    });
    if (device) {
      const bySerial = await db.ticket.findFirst({
        where: { deviceId: device.id },
        orderBy: { reportedAt: "desc" },
      });
      if (bySerial) {
        if (bySerial.state === "CLOSED") {
          return {
            kind: "SERIAL_ON_CLOSED",
            existingTicketId: bySerial.id,
          };
        }
        return {
          kind: "SERIAL_OPEN_MATCH",
          existingTicketId: bySerial.id,
        };
      }
    }
  }

  return { kind: "NONE" };
}
