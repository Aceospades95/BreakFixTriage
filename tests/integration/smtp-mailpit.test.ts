import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { dispatchEmailEvent, processEmailJob } from "@/lib/email/send";
import { resetEmailProviderCache } from "@/lib/email/provider";
import { claim } from "@/lib/email/queue";

/**
 * Round-16 (D1) — true-SMTP verification against Mailpit.
 *
 * The dispatch-email-event spec proves the chokepoint contract via
 * the in-memory provider; this spec proves the LAST hop — a real
 * SMTP handshake through nodemailer into the Mailpit sink the CI
 * integration job has run (unexercised) since Round 11. Asserts the
 * message lands in Mailpit's JSON API with the rendered subject.
 *
 * Skipped without DATABASE_URL + SMTP_HOST (Mailpit is a CI-profile
 * service; local runs without one skip cleanly).
 */

const prisma = new PrismaClient();

const TAG = `smtp${Date.now().toString(36)}`;
const RECIPIENT = `mailpit-${TAG}@example.test`;
const MAILPIT_API = `http://${process.env.SMTP_HOST ?? "127.0.0.1"}:8025`;

let priorProvider: string | undefined;
let priorFrom: string | undefined;
let schoolId: string;
let ticketId: string;
let incident: string;

describe.skipIf(!process.env.DATABASE_URL || !process.env.SMTP_HOST)(
  "SMTP delivery via Mailpit",
  () => {
    beforeAll(async () => {
      priorProvider = process.env.EMAIL_PROVIDER;
      priorFrom = process.env.SMTP_FROM;
      process.env.EMAIL_PROVIDER = "smtp";
      if (!process.env.SMTP_FROM) {
        process.env.SMTP_FROM = "BreakFix CI <ci@breakfix.local>";
      }
      resetEmailProviderCache();

      const district = await prisma.district.upsert({
        where: { code: "IT-DIST" },
        create: {
          code: "IT-DIST",
          name: "Integration District",
          region: "NYC",
        },
        update: {},
      });
      const school = await prisma.school.create({
        data: {
          code: `IT-${TAG}`,
          name: `SMTP School ${TAG}`,
          districtId: district.id,
        },
      });
      schoolId = school.id;
      incident = `INC${Date.now().toString().slice(-9)}7`;
      const ticket = await prisma.ticket.create({
        data: {
          incidentNumber: incident,
          shortDescription: "smtp fixture",
          state: "TRIAGE",
          schoolId,
          reportedAt: new Date(),
        },
      });
      ticketId = ticket.id;
    });

    afterAll(async () => {
      await prisma.emailRule.deleteMany({
        where: { scope: "TICKET", scopeId: ticketId },
      });
      await prisma.ticket.deleteMany({ where: { id: ticketId } });
      if (priorProvider === undefined) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = priorProvider;
      if (priorFrom === undefined) delete process.env.SMTP_FROM;
      else process.env.SMTP_FROM = priorFrom;
      resetEmailProviderCache();
      await prisma.$disconnect();
    });

    it("dispatch → worker → nodemailer → Mailpit shows the rendered subject", async () => {
      const template = await prisma.emailTemplate.findFirstOrThrow({
        where: { key: "ticket_created" },
        select: { id: true },
      });
      const rule = await prisma.emailRule.create({
        data: {
          scope: "TICKET",
          scopeId: ticketId,
          event: "ticket_created",
          recipients: {
            to: [{ kind: "literal", value: RECIPIENT }],
            cc: [],
            bcc: [],
          },
          templateId: template.id,
          enabled: true,
        },
      });

      await dispatchEmailEvent(
        "ticket_created",
        {
          ticketId,
          schoolId,
          variables: {
            ticket: {
              number: incident,
              summary: "smtp fixture",
              school: "SMTP School",
              priority: "Normal",
            },
            reporter: { name: "CI" },
            link: `https://example.test/tickets/${incident}`,
          },
        },
        prisma,
      );

      let job = await claim(`smtp-worker-${TAG}`, prisma);
      while (job) {
        await processEmailJob(job, prisma);
        job = await claim(`smtp-worker-${TAG}`, prisma);
      }

      const log = await prisma.emailLog.findFirstOrThrow({
        where: { ruleId: rule.id },
        orderBy: { createdAt: "desc" },
      });
      expect(log.status).toBe("sent");

      // Poll the Mailpit JSON API for the delivered message. The
      // plain messages list (not /search) is deliberate: search
      // tokenization varies across Mailpit versions — the first CI
      // run found nothing for a subject the list endpoint shows.
      let found = false;
      let lastSeen = "";
      for (let i = 0; i < 20 && !found; i++) {
        try {
          const res = await fetch(`${MAILPIT_API}/api/v1/messages?limit=50`);
          if (res.ok) {
            const body = (await res.json()) as {
              messages?: { Subject?: string }[];
            };
            const subjects = (body.messages ?? []).map(
              (m) => m.Subject ?? "",
            );
            lastSeen = subjects.join(" | ");
            found = subjects.some((s) => s.includes(incident));
          }
        } catch {
          // Mailpit may still be warming; retry.
        }
        if (!found) await new Promise((r) => setTimeout(r, 500));
      }
      expect(
        found,
        `Mailpit never showed a message with subject containing ${incident}; saw: ${lastSeen || "(none)"}`,
      ).toBe(true);
    }, 30_000);
  },
);
