import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { dispatchEmailEvent, processEmailJob } from "@/lib/email/send";
import {
  clearMemoryInbox,
  getMemoryInbox,
  resetEmailProviderCache,
} from "@/lib/email/provider";
import { claim } from "@/lib/email/queue";

/**
 * Round-11 §2D — dispatchEmailEvent integration. Implemented in
 * Round-15 via the in-memory provider (backlog B12 option b): the
 * stubs were gated on a Mailpit SMTP sink, but the chokepoint's
 * contract — rule matching, recipient resolution, EmailLog rows,
 * worker send — is assertable in-process. The memory provider
 * "delivers" into an array; nothing leaves the process. A future
 * Mailpit pass can layer true-SMTP verification on top (the CI
 * integration job already runs the container).
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();

const TAG = `dee${Date.now().toString(36)}`;
const RECIPIENT = `spoc-${TAG}@example.test`;

let schoolId: string;
let ticketId: string;
let templateId: string;

describe.skipIf(!process.env.DATABASE_URL)("dispatchEmailEvent", () => {
  beforeAll(async () => {
    process.env.EMAIL_PROVIDER = "memory";
    resetEmailProviderCache();

    const district = await prisma.district.upsert({
      where: { code: "IT-DIST" },
      create: { code: "IT-DIST", name: "Integration District", region: "NYC" },
      update: {},
    });
    const school = await prisma.school.create({
      data: {
        code: `IT-${TAG}`,
        name: `Email School ${TAG}`,
        districtId: district.id,
      },
    });
    schoolId = school.id;
    const ticket = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${Date.now().toString().slice(-9)}9`,
        shortDescription: "email dispatch fixture",
        state: "TRIAGE",
        schoolId,
        reportedAt: new Date(),
      },
    });
    ticketId = ticket.id;
    const template = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "ticket_created" },
      select: { id: true },
    });
    templateId = template.id;
  });

  beforeEach(async () => {
    clearMemoryInbox();
    // Each case creates its own rule; remove leftovers so rule
    // matching is deterministic.
    await prisma.emailRule.deleteMany({
      where: { event: "ticket_created", scope: "TICKET", scopeId: ticketId },
    });
  });

  afterAll(async () => {
    await prisma.emailRule.deleteMany({
      where: { event: "ticket_created", scope: "TICKET", scopeId: ticketId },
    });
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    delete process.env.EMAIL_PROVIDER;
    resetEmailProviderCache();
    await prisma.$disconnect();
  });

  const VARIABLES = {
    ticket: {
      number: "INC0000001",
      summary: "cracked screen",
      school: "Email School",
      priority: "Normal",
    },
    reporter: { name: "Pat Reporter" },
    link: "https://example.test/tickets/INC0000001",
  };

  async function createRule(enabled: boolean) {
    return prisma.emailRule.create({
      data: {
        scope: "TICKET",
        scopeId: ticketId,
        event: "ticket_created",
        recipients: {
          to: [{ kind: "literal", value: RECIPIENT }],
          cc: [],
          bcc: [],
        },
        templateId,
        enabled,
      },
    });
  }

  it("ticket_created event with one enabled rule writes a queued EmailLog row", async () => {
    const rule = await createRule(true);
    const dispatched = await dispatchEmailEvent(
      "ticket_created",
      { ticketId, schoolId, variables: VARIABLES },
      prisma,
    );
    const forRule = dispatched.filter((d) => d.ruleId === rule.id);
    expect(forRule).toHaveLength(1);

    const log = await prisma.emailLog.findUniqueOrThrow({
      where: { id: forRule[0]!.emailLogId },
    });
    expect(log.status).toBe("queued");
    expect(log.ticketId).toBe(ticketId);
    expect(log.subject).toContain("INC0000001");
  });

  it("EmailLog.to[] matches the rule's recipient spec", async () => {
    const rule = await createRule(true);
    const dispatched = await dispatchEmailEvent(
      "ticket_created",
      { ticketId, schoolId, variables: VARIABLES },
      prisma,
    );
    const forRule = dispatched.find((d) => d.ruleId === rule.id);
    const log = await prisma.emailLog.findUniqueOrThrow({
      where: { id: forRule!.emailLogId },
    });
    expect(log.to).toEqual([RECIPIENT]);
    expect(log.cc).toEqual([]);
  });

  it("worker send delivers the rendered subject to the provider inbox", async () => {
    const rule = await createRule(true);
    await dispatchEmailEvent(
      "ticket_created",
      { ticketId, schoolId, variables: VARIABLES },
      prisma,
    );

    // Drain the queue the way the worker does.
    let job = await claim(`it-worker-${TAG}`, prisma);
    let sent = 0;
    while (job) {
      await processEmailJob(job, prisma);
      sent++;
      job = await claim(`it-worker-${TAG}`, prisma);
    }
    expect(sent).toBeGreaterThanOrEqual(1);

    const inbox = getMemoryInbox();
    const msg = inbox.find((m) => m.to.includes(RECIPIENT));
    expect(msg, "memory inbox missing the dispatched message").toBeDefined();
    expect(msg!.subject).toBe(
      "Ticket INC0000001 created — cracked screen",
    );

    const dispatchedLog = await prisma.emailLog.findFirstOrThrow({
      where: { ruleId: rule.id },
      orderBy: { createdAt: "desc" },
    });
    expect(dispatchedLog.status).toBe("sent");
    expect(dispatchedLog.providerMessageId).toMatch(/^memory-/);
  });

  it("transition with notifyOnEnter delivers the status email end-to-end", async () => {
    // Round-15 — this is the path the R15 audit found dead: the
    // transition engine passed flat ids that failed template
    // validation, so notifyOnEnter sends always dead-lettered.
    const { transitionTicket } = await import("@/lib/workflow/transition");
    const statusTemplate = await prisma.emailTemplate.findFirstOrThrow({
      where: { key: "status_in_repair" },
      select: { id: true },
    });
    const t = await prisma.ticket.create({
      data: {
        incidentNumber: `INC${Date.now().toString().slice(-9)}8`,
        shortDescription: "transition email fixture",
        state: "DIAGNOSIS",
        schoolId,
        reportedAt: new Date(),
      },
    });
    const rule = await prisma.emailRule.create({
      data: {
        scope: "TICKET",
        scopeId: t.id,
        event: "status_in_repair",
        recipients: {
          to: [{ kind: "literal", value: RECIPIENT }],
          cc: [],
          bcc: [],
        },
        templateId: statusTemplate.id,
        enabled: true,
      },
    });
    const priorConfig = await prisma.appSetting.findUnique({
      where: { key: "status_workflow_config" },
    });
    await prisma.appSetting.upsert({
      where: { key: "status_workflow_config" },
      create: {
        key: "status_workflow_config",
        value: JSON.stringify({
          transitions: {},
          sla: {},
          disabled: [],
          notifyOnEnter: { IN_REPAIR: true },
        }),
      },
      update: {
        value: JSON.stringify({
          transitions: {},
          sla: {},
          disabled: [],
          notifyOnEnter: { IN_REPAIR: true },
        }),
      },
    });

    try {
      await transitionTicket(t.id, "IN_REPAIR", {}, prisma);

      let job = await claim(`it-worker-${TAG}-t`, prisma);
      while (job) {
        await processEmailJob(job, prisma);
        job = await claim(`it-worker-${TAG}-t`, prisma);
      }

      const log = await prisma.emailLog.findFirstOrThrow({
        where: { ruleId: rule.id },
        orderBy: { createdAt: "desc" },
      });
      expect(log.status).toBe("sent");
      expect(log.subject).toBe(
        `Ticket ${t.incidentNumber} is now in repair`,
      );
      const msg = getMemoryInbox().find((m) =>
        m.subject.includes(t.incidentNumber),
      );
      expect(msg, "transition email missing from inbox").toBeDefined();
    } finally {
      // Restore the status config so other suites see the
      // pre-test workflow behavior.
      if (priorConfig) {
        await prisma.appSetting.update({
          where: { key: "status_workflow_config" },
          data: { value: priorConfig.value },
        });
      } else {
        await prisma.appSetting.deleteMany({
          where: { key: "status_workflow_config" },
        });
      }
      await prisma.emailRule.delete({ where: { id: rule.id } });
      await prisma.ticket.delete({ where: { id: t.id } });
    }
  });

  it("disabled rule does NOT write an EmailLog row", async () => {
    const rule = await createRule(false);
    const before = await prisma.emailLog.count({ where: { ruleId: rule.id } });
    const dispatched = await dispatchEmailEvent(
      "ticket_created",
      { ticketId, schoolId, variables: VARIABLES },
      prisma,
    );
    expect(dispatched.filter((d) => d.ruleId === rule.id)).toHaveLength(0);
    const after = await prisma.emailLog.count({ where: { ruleId: rule.id } });
    expect(after).toBe(before);
  });
});
