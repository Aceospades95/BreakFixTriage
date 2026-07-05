import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient, QuoteStatus } from "@prisma/client";
import { sweepExpiredQuotes } from "@/lib/quotes/sweep";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * QA audit (July 2026), BUG-3 regression — reproduces the exact
 * INC1000003 shape: quote APPROVED, ticket consumed the approval and
 * moved to IN_REPAIR, hold window then lapsed. The sweep must leave
 * the quote APPROVED (it used to flip it to NO_RESPONSE, making the
 * quote record contradict the ticket's own "Quote approved → In
 * repair" timeline).
 *
 * Also pins the preserved Bug-4b behaviour: an APPROVED quote whose
 * ticket is still stalled AT the quote gate does expire.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const RUN_TAG = `qsc-${Date.now()}`;
const day = 24 * 60 * 60 * 1000;

async function fixture(state: "IN_REPAIR" | "QUOTE_APPROVED", n: number) {
  const district = await ensureIntegrationDistrict(prisma);
  const school = await prisma.school.upsert({
    where: { code: "IT-SCH-QSC" },
    create: {
      code: "IT-SCH-QSC",
      name: "Quote Sweep School",
      districtId: district.id,
    },
    update: {},
  });
  const ticket = await prisma.ticket.create({
    data: {
      incidentNumber: `INC${RUN_TAG}-${n}`,
      shortDescription: "quote sweep fixture",
      state,
      schoolId: school.id,
      reportedAt: new Date(Date.now() - 30 * day),
    },
  });
  const quote = await prisma.quote.create({
    data: {
      ticketId: ticket.id,
      status: QuoteStatus.APPROVED,
      amountCents: 12500,
      sentAt: new Date(Date.now() - 20 * day),
      respondedAt: new Date(Date.now() - 15 * day),
      holdUntil: new Date(Date.now() - 10 * day), // lapsed
    },
  });
  return { ticket, quote };
}

describe.skipIf(!process.env.DATABASE_URL)(
  "quote sweep vs consumed approvals",
  () => {
    afterAll(async () => {
      await prisma.ticket.deleteMany({
        where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
      });
      await prisma.$disconnect();
    });

    it("leaves an APPROVED quote alone once the ticket consumed the approval", async () => {
      const { ticket, quote } = await fixture("IN_REPAIR", 1);

      const report = await sweepExpiredQuotes({}, prisma);
      expect(report.skippedConsumed).toBeGreaterThanOrEqual(1);

      const after = await prisma.quote.findUniqueOrThrow({
        where: { id: quote.id },
      });
      expect(after.status).toBe(QuoteStatus.APPROVED);
      const ticketAfter = await prisma.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(ticketAfter.state).toBe("IN_REPAIR");
    });

    it("still expires an APPROVED quote whose ticket is stalled at the gate (Bug-4b)", async () => {
      const { ticket, quote } = await fixture("QUOTE_APPROVED", 2);

      await sweepExpiredQuotes({}, prisma);

      const after = await prisma.quote.findUniqueOrThrow({
        where: { id: quote.id },
      });
      expect(after.status).toBe(QuoteStatus.NO_RESPONSE);
      const ticketAfter = await prisma.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(ticketAfter.state).toBe("QUOTE_NO_RESPONSE");
    });
  },
);
