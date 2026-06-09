import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runImport } from "@/lib/import/pipeline";

/**
 * Round-11 §2D — import dedupe integration. Implemented in
 * Round-14: drives the real `runImport` pipeline with in-memory
 * CSV buffers against a live Postgres.
 *
 * Covers the Round-7 §3C dedupe semantics:
 *   - re-importing an OPEN INC# updates the existing ticket
 *     (no second Ticket row);
 *   - re-importing a CLOSED INC# files a DuplicateConflict and
 *     marks the row DUPLICATE;
 *   - importing an INC that matches a PENDING_PICKUP_UNLINKED
 *     synthetic (same device + school) auto-merges it.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();

const TAG = `idp${Date.now().toString(36)}`;
// incidentNumber must match /^[A-Z]{2,5}\d+$/ — digits only after
// the prefix, so the INC fixtures use a numeric run tag.
const NUM = Date.now().toString().slice(-9);
const SCHOOL_CODE = `IT-${TAG}`;

let uploaderId: string;
let schoolId: string;

function csv(rows: Array<Record<string, string>>): Buffer {
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => r[h] ?? "").join(",")),
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

describe.skipIf(!process.env.DATABASE_URL)("import dedupe", () => {
  beforeAll(async () => {
    const district = await prisma.district.upsert({
      where: { code: "IT-DIST" },
      create: { code: "IT-DIST", name: "Integration District", region: "NYC" },
      update: {},
    });
    const school = await prisma.school.create({
      data: {
        code: SCHOOL_CODE,
        name: `Import School ${TAG}`,
        districtId: district.id,
      },
    });
    schoolId = school.id;
    const uploader = await prisma.user.upsert({
      where: { email: "import-it@example.test" },
      create: {
        email: "import-it@example.test",
        name: "Import Integration",
        passwordHash: "x",
        role: "ADMIN",
      },
      update: {},
    });
    uploaderId = uploader.id;
  });

  afterAll(async () => {
    const fixtureTickets = {
      OR: [
        { incidentNumber: { startsWith: `INC${NUM}` } },
        { incidentNumber: { contains: TAG } },
      ],
    };
    // DuplicateConflict rows hold non-cascading FKs to tickets.
    await prisma.duplicateConflict.deleteMany({
      where: {
        OR: [
          { leftTicket: fixtureTickets },
          { rightTicket: fixtureTickets },
        ],
      },
    });
    await prisma.ticket.deleteMany({ where: fixtureTickets });
    await prisma.$disconnect();
  });

  it("re-importing the same OPEN INC# updates instead of duplicating", async () => {
    const inc = `INC${NUM}1`;
    const buffer = csv([
      {
        number: inc,
        opened: "2026-06-01 09:00:00",
        short_description: "broken hinge",
        location_code: SCHOOL_CODE,
      },
    ]);

    const first = await runImport(
      { filename: `${TAG}-1.csv`, buffer, uploadedByUserId: uploaderId },
      prisma,
    );
    expect(first.created).toBe(1);
    expect(first.duplicates).toBe(0);

    const second = await runImport(
      { filename: `${TAG}-1b.csv`, buffer, uploadedByUserId: uploaderId },
      prisma,
    );
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);

    const count = await prisma.ticket.count({
      where: { incidentNumber: inc },
    });
    expect(count).toBe(1);
  });

  it("re-importing a CLOSED INC# files a DuplicateConflict", async () => {
    const inc = `INC${NUM}2`;
    const buffer = csv([
      {
        number: inc,
        opened: "2026-06-01 10:00:00",
        short_description: "cracked screen",
        location_code: SCHOOL_CODE,
      },
    ]);

    await runImport(
      { filename: `${TAG}-2.csv`, buffer, uploadedByUserId: uploaderId },
      prisma,
    );
    await prisma.ticket.update({
      where: { incidentNumber: inc },
      data: { state: "CLOSED" },
    });

    const second = await runImport(
      { filename: `${TAG}-2b.csv`, buffer, uploadedByUserId: uploaderId },
      prisma,
    );
    expect(second.duplicates).toBe(1);
    expect(second.created).toBe(0);

    const existing = await prisma.ticket.findUniqueOrThrow({
      where: { incidentNumber: inc },
      select: { id: true },
    });
    const conflict = await prisma.duplicateConflict.findFirst({
      where: { kind: "INCIDENT", leftTicketId: existing.id },
    });
    expect(conflict).not.toBeNull();
  });

  it("importing an INC matching a synthetic pickup auto-merges it", async () => {
    const serial = `SN-${TAG}-MERGE`;
    const device = await prisma.device.create({
      data: { serialNumber: serial, ownerSchoolId: schoolId },
    });
    const synthetic = await prisma.ticket.create({
      data: {
        incidentNumber: `SYN-${TAG}-1`,
        shortDescription: "on-route pickup (unlinked)",
        state: "PENDING_PICKUP_UNLINKED",
        schoolId,
        deviceId: device.id,
        reportedAt: new Date(),
      },
    });

    const inc = `INC${NUM}3`;
    const buffer = csv([
      {
        number: inc,
        opened: "2026-06-02 08:30:00",
        short_description: "device picked up on route",
        location_code: SCHOOL_CODE,
        serial_number: serial,
      },
    ]);

    const result = await runImport(
      { filename: `${TAG}-3.csv`, buffer, uploadedByUserId: uploaderId },
      prisma,
    );
    expect(result.created).toBe(1);
    expect(result.mergedFromSynthetic).toBe(1);

    const after = await prisma.ticket.findUniqueOrThrow({
      where: { id: synthetic.id },
      select: { state: true },
    });
    expect(after.state).not.toBe("PENDING_PICKUP_UNLINKED");
  });
});
