import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient, QuoteStatus } from "@prisma/client";
import {
  findClobberedApprovals,
  repairClobberedApprovals,
} from "@/lib/quotes/repair";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Round-5 QA audit — the BUG-3 repair missed the real production row
 * because it required QuoteActivity evidence and a fixed
 * current-state list. The matcher is now timeline-based; these
 * fixtures reproduce the deployed INC1000003 shape exactly (NO
 * QuoteActivity rows at all, ticket since moved onward) and the
 * legit Bug-4b stall shape that must never be "repaired".
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const RUN_TAG = `qrp-${Date.now()}`;
const day = 24 * 60 * 60 * 1000;

async function fixtureTicket(
  n: number,
  state: "REOPENED" | "DELIVERY_SCHEDULED" | "QUOTE_NO_RESPONSE",
  timeline: Array<{ to: string; daysAgo: number }>,
) {
  const district = await ensureIntegrationDistrict(prisma);
  const school = await prisma.school.upsert({
    where: { code: "IT-SCH-QRP" },
    create: {
      code: "IT-SCH-QRP",
      name: "Quote Repair School",
      districtId: district.id,
    },
    update: {},
  });
  const ticket = await prisma.ticket.create({
    data: {
      incidentNumber: `INC${RUN_TAG}-${n}`,
      shortDescription: "quote repair fixture",
      state,
      schoolId: school.id,
      reportedAt: new Date(Date.now() - 90 * day),
    },
  });
  for (const ev of timeline) {
    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        fromState: null,
        toState: ev.to as never,
        reason: "fixture",
        createdAt: new Date(Date.now() - ev.daysAgo * day),
      },
    });
  }
  const quote = await prisma.quote.create({
    data: {
      ticketId: ticket.id,
      status: QuoteStatus.NO_RESPONSE,
      amountCents: 20000,
      sentAt: new Date(Date.now() - 80 * day),
      holdUntil: new Date(Date.now() - 70 * day),
      // Deliberately NO QuoteActivity rows — the deployed corrupted
      // row predates activity logging.
    },
  });
  return { ticket, quote };
}

describe.skipIf(!process.env.DATABASE_URL)("quote repair matcher", () => {
  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("matches the consumed-approval shape purely from the timeline and repairs it", async () => {
    // INC1000003 shape: approved -> in repair -> ... -> moved again
    // (even to a state outside any past-the-gate list, e.g. REOPENED).
    const { ticket, quote } = await fixtureTicket(1, "REOPENED", [
      { to: "QUOTE_APPROVED", daysAgo: 85 },
      { to: "IN_REPAIR", daysAgo: 84 },
      { to: "DELIVERY_SCHEDULED", daysAgo: 60 },
      { to: "REOPENED", daysAgo: 10 },
    ]);

    const found = await findClobberedApprovals(prisma);
    const mine = found.filter((f) => f.ticketId === ticket.id);
    expect(mine).toHaveLength(1);

    const n = await repairClobberedApprovals(mine, prisma);
    expect(n).toBe(1);
    const after = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(after.status).toBe(QuoteStatus.APPROVED);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: quote.id, action: "quote.repair:restore-approved" },
    });
    expect(audit).not.toBeNull();
    const activity = await prisma.quoteActivity.findFirst({
      where: { quoteId: quote.id, kind: "repair" },
    });
    expect(activity).not.toBeNull();
  });

  it("leaves the legit Bug-4b stall expiry alone", async () => {
    // Approved, never acted on, sweep-expired: QUOTE_APPROVED
    // followed by QUOTE_NO_RESPONSE. Correct data — must not match.
    const { ticket, quote } = await fixtureTicket(2, "QUOTE_NO_RESPONSE", [
      { to: "QUOTE_APPROVED", daysAgo: 85 },
      { to: "QUOTE_NO_RESPONSE", daysAgo: 70 },
    ]);

    const found = await findClobberedApprovals(prisma);
    expect(found.some((f) => f.ticketId === ticket.id)).toBe(false);
    const still = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(still.status).toBe(QuoteStatus.NO_RESPONSE);
  });

  it("ignores quotes that were never approved at all", async () => {
    const { ticket } = await fixtureTicket(3, "QUOTE_NO_RESPONSE", [
      { to: "QUOTE_SENT" as never, daysAgo: 85 },
      { to: "QUOTE_NO_RESPONSE", daysAgo: 70 },
    ]);
    const found = await findClobberedApprovals(prisma);
    expect(found.some((f) => f.ticketId === ticket.id)).toBe(false);
  });
});
