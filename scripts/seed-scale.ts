/**
 * Five-borough scale fixture.
 *
 * Generates a realistic NYC-wide dataset so scale problems can be
 * MEASURED instead of argued about: page timings, query plans, and
 * UI behaviour at the volumes the expansion actually implies.
 *
 *   npx tsx scripts/seed-scale.ts            # default profile
 *   SCALE_TICKETS=50000 npx tsx scripts/seed-scale.ts
 *
 * Safe to re-run: everything it creates is prefixed/derivable and it
 * never touches rows it did not create. NOT for production — guard
 * is an explicit env flag.
 */
import { PrismaClient, type Prisma, TicketState } from "@prisma/client";

const prisma = new PrismaClient();

const BOROUGHS = [
  { letter: "M", name: "Manhattan", districts: [1, 2, 3, 4, 5, 6] },
  { letter: "X", name: "Bronx", districts: [7, 8, 9, 10, 11, 12] },
  { letter: "K", name: "Brooklyn", districts: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 32] },
  { letter: "Q", name: "Queens", districts: [24, 25, 26, 27, 28, 29, 30] },
  { letter: "R", name: "Staten Island", districts: [31] },
] as const;

const TICKETS = Number(process.env.SCALE_TICKETS ?? 40000);
const DEVICES_PER_SCHOOL = Number(process.env.SCALE_DEVICES_PER_SCHOOL ?? 60);
const SCHOOLS_PER_DISTRICT = Number(process.env.SCALE_SCHOOLS_PER_DISTRICT ?? 45);

// Deterministic PRNG so repeat runs produce the same shape.
let seed = 20260706;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

const OPEN_STATES: TicketState[] = [
  "IMPORTED",
  "TRIAGE",
  "AWAITING_PICKUP",
  "PICKUP_SCHEDULED",
  "IN_WAREHOUSE",
  "DIAGNOSIS",
  "AWAITING_PARTS",
  "PARTS_ORDERED",
  "IN_REPAIR",
  "REPAIR_COMPLETED",
  "PENDING_DELIVERY",
  "DELIVERY_SCHEDULED",
];

async function main() {
  if (process.env.ALLOW_SCALE_SEED !== "yes") {
    console.error(
      "Refusing to run without ALLOW_SCALE_SEED=yes (this writes tens of thousands of rows).",
    );
    process.exit(1);
  }
  const t0 = Date.now();

  // 1. Districts — one row per real NYC community school district,
  //    region = borough so the borough rollups have something true.
  const districtIds: { id: string; letter: string; num: number }[] = [];
  for (const b of BOROUGHS) {
    for (const num of b.districts) {
      const code = `NYC-D${String(num).padStart(2, "0")}`;
      const d = await prisma.district.upsert({
        where: { code },
        create: { code, name: `District ${num} (${b.name})`, region: b.name },
        update: { region: b.name },
      });
      districtIds.push({ id: d.id, letter: b.letter, num });
    }
  }
  console.log(`districts: ${districtIds.length}`);

  // 2. Schools with real-shaped DBNs (e.g. 11X123).
  const schools: { id: string; districtId: string }[] = [];
  for (const d of districtIds) {
    const rows: Prisma.SchoolCreateManyInput[] = [];
    for (let i = 0; i < SCHOOLS_PER_DISTRICT; i++) {
      const dbn = `${String(d.num).padStart(2, "0")}${d.letter}${String(100 + i).padStart(3, "0")}`;
      rows.push({
        code: dbn,
        name: `P.S. ${100 + i} ${d.letter === "X" ? "Bronx" : d.letter === "K" ? "Brooklyn" : d.letter === "Q" ? "Queens" : d.letter === "R" ? "Staten Island" : "Manhattan"}`,
        districtId: d.id,
      });
    }
    await prisma.school.createMany({ data: rows, skipDuplicates: true });
  }
  const allSchools = await prisma.school.findMany({
    where: { district: { code: { startsWith: "NYC-D" } } },
    select: { id: true, districtId: true },
  });
  schools.push(...allSchools);
  console.log(`schools: ${schools.length}`);

  // 3. Device models + devices.
  const model = await prisma.deviceModel.upsert({
    where: {
      manufacturer_modelName: { manufacturer: "Acer", modelName: "Chromebook 311" },
    },
    create: { manufacturer: "Acer", modelName: "Chromebook 311" },
    update: {},
  });
  const model2 = await prisma.deviceModel.upsert({
    where: {
      manufacturer_modelName: { manufacturer: "Lenovo", modelName: "300e" },
    },
    create: { manufacturer: "Lenovo", modelName: "300e" },
    update: {},
  });

  let deviceCount = 0;
  for (let s = 0; s < schools.length; s += 20) {
    const batch = schools.slice(s, s + 20);
    const rows: Prisma.DeviceCreateManyInput[] = [];
    for (const sc of batch) {
      for (let i = 0; i < DEVICES_PER_SCHOOL; i++) {
        rows.push({
          serialNumber: `SCL-${sc.id.slice(-6)}-${i}`,
          assetTag: `AT-${sc.id.slice(-6)}-${i}`,
          modelId: rnd() > 0.5 ? model.id : model2.id,
          ownerSchoolId: sc.id,
          warrantyExpires: new Date(
            Date.now() + (rnd() > 0.4 ? 1 : -1) * Math.floor(rnd() * 500) * 86400000,
          ),
        });
      }
    }
    await prisma.device.createMany({ data: rows, skipDuplicates: true });
    deviceCount += rows.length;
  }
  console.log(`devices: ~${deviceCount}`);

  // 4. Tickets spread across every school + state, with realistic age.
  const devices = await prisma.device.findMany({
    where: { serialNumber: { startsWith: "SCL-" } },
    select: { id: true, ownerSchoolId: true },
    take: TICKETS,
  });
  let made = 0;
  const CHUNK = 2000;
  while (made < TICKETS) {
    const rows: Prisma.TicketCreateManyInput[] = [];
    for (let i = 0; i < CHUNK && made + i < TICKETS; i++) {
      const dev = devices[Math.floor(rnd() * devices.length)]!;
      const closed = rnd() < 0.45;
      const ageDays = Math.floor(rnd() * 400);
      const reportedAt = new Date(Date.now() - ageDays * 86400000);
      rows.push({
        incidentNumber: `SCALE${String(made + i).padStart(7, "0")}`,
        schoolId: dev.ownerSchoolId!,
        deviceId: dev.id,
        reportedAt,
        stateEnteredAt: new Date(
          reportedAt.getTime() + Math.floor(rnd() * 30) * 86400000,
        ),
        shortDescription: pick([
          "Cracked screen",
          "Won't power on",
          "Keyboard keys missing",
          "Battery not charging",
          "Liquid damage",
          "Broken hinge",
          "Trackpad unresponsive",
        ]),
        priority: pick(["LOW", "NORMAL", "HIGH", "URGENT"] as const),
        state: closed ? TicketState.CLOSED : pick(OPEN_STATES),
        closedAt: closed ? new Date(reportedAt.getTime() + 86400000 * 10) : null,
      });
    }
    await prisma.ticket.createMany({ data: rows, skipDuplicates: true });
    made += rows.length;
    if (made % 10000 === 0) console.log(`  tickets: ${made}`);
  }
  console.log(`tickets: ${made}`);

  // 5. Users across boroughs so pickers/assignment feel real.
  const userRows: Prisma.UserCreateManyInput[] = [];
  for (let i = 0; i < 120; i++) {
    userRows.push({
      email: `scale-user-${i}@breakfix.local`,
      name: `Scale User ${i}`,
      role: pick(["TECHNICIAN", "DRIVER", "DISPATCHER", "WAREHOUSE", "READ_ONLY"] as const),
    });
  }
  await prisma.user.createMany({ data: userRows, skipDuplicates: true });
  console.log(`users: +${userRows.length}`);

  const totals = {
    districts: await prisma.district.count(),
    schools: await prisma.school.count(),
    devices: await prisma.device.count(),
    tickets: await prisma.ticket.count(),
    users: await prisma.user.count(),
  };
  console.log("TOTALS", JSON.stringify(totals));
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
