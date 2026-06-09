import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { transitionTicket } from "@/lib/workflow/transition";
import {
  GuardFailedError,
  InvalidTransitionError,
} from "@/lib/workflow/errors";

/**
 * Round-11 §2D — ticket state-machine integration. Implemented in
 * Round-14: the previous stubs named states (OPEN / IN_PROGRESS /
 * ON_BENCH / RESOLVED) that have never existed in the 26-state
 * taxonomy; these tests walk real edges from
 * src/lib/workflow/states.ts against a live Postgres.
 *
 * Verifies legal transitions succeed and write TicketEvent +
 * AuditLog rows, illegal edges throw InvalidTransitionError, and
 * the requireJobForScheduled guard rejects scheduling without a
 * job payload.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();

const RUN_TAG = `it-${Date.now()}`;

async function createFixtureTicket(state: "IMPORTED" | "AWAITING_PICKUP") {
  const district = await prisma.district.upsert({
    where: { code: "IT-DIST" },
    create: { code: "IT-DIST", name: "Integration District", region: "NYC" },
    update: {},
  });
  const school = await prisma.school.upsert({
    where: { code: "IT-SCH-1" },
    create: {
      code: "IT-SCH-1",
      name: "Integration School",
      districtId: district.id,
    },
    update: {},
  });
  return prisma.ticket.create({
    data: {
      incidentNumber: `INC${RUN_TAG}-${Math.random().toString(36).slice(2, 8)}`,
      shortDescription: "integration fixture",
      state,
      schoolId: school.id,
      reportedAt: new Date(),
    },
  });
}

describe.skipIf(!process.env.DATABASE_URL)("ticket state machine", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("IMPORTED → TRIAGE writes TicketEvent + audit row", async () => {
    const ticket = await createFixtureTicket("IMPORTED");
    const updated = await transitionTicket(ticket.id, "TRIAGE", {
      reason: "integration walk",
    });
    expect(updated.state).toBe("TRIAGE");

    const event = await prisma.ticketEvent.findFirst({
      where: { ticketId: ticket.id, toState: "TRIAGE" },
    });
    expect(event).not.toBeNull();
    expect(event?.fromState).toBe("IMPORTED");

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: "Ticket",
        entityId: ticket.id,
        action: "transition:IMPORTED->TRIAGE",
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.reason).toBe("integration walk");
  });

  it("walks TRIAGE → AWAITING_PICKUP → ON_HOLD → AWAITING_PICKUP edge by edge", async () => {
    const ticket = await createFixtureTicket("IMPORTED");
    const lane = [
      "TRIAGE",
      "AWAITING_PICKUP",
      // PICKUP_SCHEDULED is skipped here — it needs a Job (guard
      // covered below). The ON_HOLD detour exercises the overlay
      // lane and the return edge.
      "ON_HOLD",
      "AWAITING_PICKUP",
    ] as const;
    for (const to of lane) {
      const updated = await transitionTicket(ticket.id, to);
      expect(updated.state).toBe(to);
    }
    const events = await prisma.ticketEvent.count({
      where: { ticketId: ticket.id },
    });
    expect(events).toBe(lane.length);
  });

  it("IMPORTED → CLOSED is rejected as an illegal transition", async () => {
    const ticket = await createFixtureTicket("IMPORTED");
    await expect(
      transitionTicket(ticket.id, "CLOSED"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    // No TicketEvent side effects on rejection.
    const events = await prisma.ticketEvent.count({
      where: { ticketId: ticket.id },
    });
    expect(events).toBe(0);
  });

  it("AWAITING_PICKUP → PICKUP_SCHEDULED without a job fails the guard", async () => {
    const ticket = await createFixtureTicket("AWAITING_PICKUP");
    await expect(
      transitionTicket(ticket.id, "PICKUP_SCHEDULED"),
    ).rejects.toBeInstanceOf(GuardFailedError);
  });

  it("force bypasses the edge check and writes a warn-severity audit row", async () => {
    const ticket = await createFixtureTicket("IMPORTED");
    const updated = await transitionTicket(ticket.id, "CLOSED", {
      force: true,
      reason: "integration force-close",
      actorUserId: null,
    });
    expect(updated.state).toBe("CLOSED");
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: "Ticket",
        entityId: ticket.id,
        action: "transition:force:IMPORTED->CLOSED",
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.severity).toBe("warn");
    expect(audit?.transitionType).toBe("forced");
  });

  // "transition emits dispatchEmailEvent for notifyOnEnter states"
  // is covered end-to-end (rule → render → queue → memory-provider
  // send) by dispatch-email-event.test.ts — Round-15, B12 option b.
});
