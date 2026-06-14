import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { dispatchEmailEvent } from "@/lib/email/send";
import {
  buildSiteSummary,
  siteSummaryReportVariables,
} from "@/lib/reports/site-summary";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Round-22 §4 — the per-site report is genuinely wired through the email
 * chokepoint: a report_site rule + a school contact who receives ticket
 * emails produces a queued EmailLog addressed to that contact. (Actual
 * SMTP delivery still depends on NOTIFICATION_TRANSPORT/SMTP config; the
 * queued row proves the dispatch path.)
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const RUN_TAG = `srd-${Date.now()}`;
const CONTACT_EMAIL = `srd-poc-${Date.now()}@school.test`;
let schoolId = "";
let templateId = "";

describe.skipIf(!process.env.DATABASE_URL)("report_site dispatch", () => {
  beforeAll(async () => {
    const district = await ensureIntegrationDistrict(prisma);
    const school = await prisma.school.upsert({
      where: { code: "IT-SCH-SRD" },
      create: { code: "IT-SCH-SRD", name: "Site Report School", districtId: district.id },
      update: {},
    });
    schoolId = school.id;
    // A contact who opts into ticket-family emails (the family report_site uses).
    await prisma.contact.create({
      data: {
        schoolId: school.id,
        name: "Site POC",
        email: CONTACT_EMAIL,
        receivesTicketEmails: true,
      },
    });
    const tmpl = await prisma.emailTemplate.findUnique({
      where: { key: "report_site" },
    });
    if (!tmpl) throw new Error("report_site template not seeded — run db:seed");
    templateId = tmpl.id;
    await prisma.emailRule.create({
      data: {
        scope: "GLOBAL",
        event: "report_site",
        recipients: { to: [{ kind: "spoc" }], cc: [], bcc: [] },
        templateId,
        enabled: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.emailLog.deleteMany({ where: { templateId } });
    await prisma.emailRule.deleteMany({ where: { event: "report_site" } });
    await prisma.contact.deleteMany({ where: { email: CONTACT_EMAIL } });
    await prisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("dispatches a queued EmailLog to the school's contact", async () => {
    const summary = await buildSiteSummary(schoolId, "week", prisma);
    expect(summary).not.toBeNull();
    const variables = siteSummaryReportVariables(summary!);
    // The rendered body carries the school + a metric block.
    expect(variables.report.school).toContain("Site Report School");
    expect(variables.report.lines).toContain("Devices pending");

    const dispatched = await dispatchEmailEvent(
      "report_site",
      { schoolId, variables },
      prisma,
    );
    expect(dispatched.length).toBe(1);

    const log = await prisma.emailLog.findUnique({
      where: { id: dispatched[0]!.emailLogId },
    });
    expect(log).not.toBeNull();
    expect(log!.status).toBe("queued");
    expect(log!.to).toContain(CONTACT_EMAIL);
    expect(log!.subject).toContain("Site Report School");
  });
});
