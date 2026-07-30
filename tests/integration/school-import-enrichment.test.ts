import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runSchoolImport } from "@/lib/import/pipeline";

/**
 * Five-borough expansion — onboarding ~1,600 schools depends on the
 * school importer actually persisting what its row schema parses.
 *
 * It used to write only name/code/districtId and drop address, city,
 * state, zip, phone and the SPOC contact on the floor. That produces
 * addressless schools, which means no lat/lng, which means the route
 * map and the stop optimizer have nothing to work with — and no
 * contact, so SPOC email and the portal have no recipient.
 *
 * It also generated District.code by truncating the district name to
 * 20 characters on a @unique column, so two districts sharing a
 * 20-char prefix collided and the row was rejected.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const TAG = Date.now().toString(36).toUpperCase();

function csv(rows: string[][]): Buffer {
  return Buffer.from(rows.map((r) => r.join(",")).join("\n"), "utf8");
}

describe.skipIf(!process.env.DATABASE_URL)("school import enrichment", () => {
  afterAll(async () => {
    const schools = await prisma.school.findMany({
      where: { code: { startsWith: `SI-${TAG}` } },
      select: { id: true, addressId: true },
    });
    await prisma.contact.deleteMany({
      where: { schoolId: { in: schools.map((s) => s.id) } },
    });
    await prisma.school.deleteMany({
      where: { code: { startsWith: `SI-${TAG}` } },
    });
    await prisma.address.deleteMany({
      where: { id: { in: schools.map((s) => s.addressId!).filter(Boolean) } },
    });
    await prisma.district.deleteMany({
      where: { name: { startsWith: `Community School District ${TAG}` } },
    });
    await prisma.$disconnect();
  });

  it("persists address and SPOC contact, and survives district-code collisions", async () => {
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    // Two districts whose names share a >20-char prefix: the old
    // truncating code generator produced the same @unique code for
    // both and rejected the second row.
    const longA = `Community School District ${TAG} Alpha`;
    const longB = `Community School District ${TAG} Beta`;

    const file = csv([
      [
        "name",
        "code",
        "districtName",
        "address",
        "city",
        "state",
        "zip",
        "phone",
        "contactName",
        "contactEmail",
      ],
      [
        `Import School A ${TAG}`,
        `SI-${TAG}-A`,
        longA,
        "123 Grand Concourse",
        "Bronx",
        "NY",
        "10451",
        "718-555-0101",
        `Ada Spoc ${TAG}`,
        `ada-${TAG}@school.test`,
      ],
      [
        `Import School B ${TAG}`,
        `SI-${TAG}-B`,
        longB,
        "456 Flatbush Ave",
        "Brooklyn",
        "NY",
        "11225",
        "718-555-0202",
        `Bo Spoc ${TAG}`,
        `bo-${TAG}@school.test`,
      ],
    ]);

    const result = await runSchoolImport(
      {
        filename: `schools-${TAG}.csv`,
        buffer: file,
        uploadedByUserId: admin.id,
      },
      prisma,
    );
    // Both rows land — the collision no longer rejects the second.
    expect(result.rejected).toBe(0);
    expect(result.created).toBe(2);

    const a = await prisma.school.findFirstOrThrow({
      where: { code: `SI-${TAG}-A` },
      include: { address: true, district: true, mainContact: true },
    });
    expect(a.address?.line1).toBe("123 Grand Concourse");
    expect(a.address?.city).toBe("Bronx");
    expect(a.address?.postalCode).toBe("10451");
    expect(a.mainContact?.name).toBe(`Ada Spoc ${TAG}`);
    expect(a.mainContact?.email).toBe(`ada-${TAG}@school.test`);
    expect(a.mainContact?.phone).toBe("718-555-0101");
    // Opted in, so SPOC email actually has a recipient.
    expect(a.mainContact?.receivesTicketEmails).toBe(true);
    // Flagged for the geocoder — there is still no lat/lng.
    expect(a.needsAddress).toBe(true);

    const b = await prisma.school.findFirstOrThrow({
      where: { code: `SI-${TAG}-B` },
      include: { district: true },
    });
    // Distinct districts, distinct codes.
    expect(b.districtId).not.toBe(a.districtId);
    expect(b.district.code).not.toBe(a.district.code);
  });

  it("re-importing updates the address in place instead of duplicating", async () => {
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    const before = await prisma.school.findFirstOrThrow({
      where: { code: `SI-${TAG}-A` },
      select: { addressId: true },
    });

    const file = csv([
      ["name", "code", "districtName", "address", "city", "state", "zip"],
      [
        `Import School A ${TAG}`,
        `SI-${TAG}-A`,
        `Community School District ${TAG} Alpha`,
        "999 Updated Ave",
        "Bronx",
        "NY",
        "10452",
      ],
    ]);
    const result = await runSchoolImport(
      { filename: `schools-${TAG}-2.csv`, buffer: file, uploadedByUserId: admin.id },
      prisma,
    );
    expect(result.updated).toBe(1);

    const after = await prisma.school.findFirstOrThrow({
      where: { code: `SI-${TAG}-A` },
      include: { address: true },
    });
    expect(after.addressId).toBe(before.addressId);
    expect(after.address?.line1).toBe("999 Updated Ave");
  });
});
