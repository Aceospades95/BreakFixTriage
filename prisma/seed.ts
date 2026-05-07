/**
 * Deterministic seed data for local development and CI.
 *
 * Running `npm run db:seed` populates enough rows to exercise every UI
 * view: two districts, a handful of schools with real-ish coordinates,
 * contacts, devices, users across every role, and a couple of tickets in
 * mid-lifecycle states.
 *
 * The seed is idempotent: re-running it produces no duplicate rows.
 */

import { PrismaClient, Role, TicketState } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDefaults } from "./seed-defaults";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding BreakFix Triage…");

  // Districts
  const bronx = await prisma.district.upsert({
    where: { code: "BRONX" },
    create: { code: "BRONX", name: "Bronx", region: "NYC" },
    update: {},
  });
  const queens = await prisma.district.upsert({
    where: { code: "QUEENS" },
    create: { code: "QUEENS", name: "Queens", region: "NYC" },
    update: {},
  });

  // Users: one per role
  const users: { email: string; name: string; role: Role }[] = [
    { email: "admin@breakfix.local", name: "Alex Admin", role: Role.ADMIN },
    {
      email: "ops@breakfix.local",
      name: "Olivia Ops",
      role: Role.OPS_MANAGER,
    },
    {
      email: "dispatch@breakfix.local",
      name: "Dana Dispatcher",
      role: Role.DISPATCHER,
    },
    {
      email: "warehouse@breakfix.local",
      name: "Wes Warehouse",
      role: Role.WAREHOUSE,
    },
    {
      email: "tech@breakfix.local",
      name: "Tess Technician",
      role: Role.TECHNICIAN,
    },
    {
      email: "driver@breakfix.local",
      name: "Dante Driver",
      role: Role.DRIVER,
    },
    {
      email: "readonly@breakfix.local",
      name: "Ray ReadOnly",
      role: Role.READ_ONLY,
    },
  ];

  const passwordHash = await bcrypt.hash("breakfix-dev", 10);
  const createdUsers: Record<string, string> = {};
  for (const u of users) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        active: true,
        districts: {
          create: [
            { districtId: bronx.id },
            { districtId: queens.id },
          ],
        },
      },
      // On re-run of the seed, reset the demo password and role. This is a
      // demo dataset — idempotency matters more than preserving whatever
      // state the row drifted to. Note: district links are not touched
      // because those are many-to-many and would need explicit reconcile.
      update: {
        role: u.role,
        passwordHash,
        active: true,
        name: u.name,
      },
    });
    createdUsers[u.role] = row.id;
  }

  // Schools (deliberately a handful, with approximate lat/lng)
  const schoolSeed: {
    code: string;
    name: string;
    districtId: string;
    lat: number;
    lng: number;
  }[] = [
    {
      code: "11X101",
      name: "P.S. 101 Bronx",
      districtId: bronx.id,
      lat: 40.8448,
      lng: -73.8648,
    },
    {
      code: "11X220",
      name: "M.S. 220 Bronx",
      districtId: bronx.id,
      lat: 40.8651,
      lng: -73.891,
    },
    {
      code: "11X312",
      name: "H.S. 312 Bronx",
      districtId: bronx.id,
      lat: 40.855,
      lng: -73.883,
    },
    {
      code: "28Q045",
      name: "P.S. 45 Queens",
      districtId: queens.id,
      lat: 40.7128,
      lng: -73.8312,
    },
  ];

  for (const s of schoolSeed) {
    const existing = await prisma.school.findUnique({ where: { code: s.code } });
    if (existing) continue;
    const addr = await prisma.address.create({
      data: {
        line1: `${s.code} Address Line`,
        city: "New York",
        state: "NY",
        postalCode: "10451",
        latitude: s.lat,
        longitude: s.lng,
      },
    });
    const school = await prisma.school.create({
      data: {
        code: s.code,
        name: s.name,
        districtId: s.districtId,
        addressId: addr.id,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        schoolId: school.id,
        name: `${s.name} POC`,
        title: "School Technology Lead",
        email: `poc-${s.code.toLowerCase()}@schools.nyc`,
        phone: "718-555-0100",
        isPrimary: true,
      },
    });
    await prisma.school.update({
      where: { id: school.id },
      data: { mainContactId: contact.id },
    });
  }

  const ps101 = await prisma.school.findUnique({ where: { code: "11X101" } });
  const ms220 = await prisma.school.findUnique({ where: { code: "11X220" } });
  if (!ps101 || !ms220) throw new Error("seed: schools missing");

  // Device model + devices
  const model = await prisma.deviceModel.upsert({
    where: {
      manufacturer_modelName: {
        manufacturer: "Acme",
        modelName: "EduBook 14",
      },
    },
    create: {
      manufacturer: "Acme",
      modelName: "EduBook 14",
      formFactor: "CHROMEBOOK",
      warrantyMonths: 36,
    },
    update: {},
  });

  const device1 = await prisma.device.upsert({
    where: { serialNumber: "SN-0001" },
    create: {
      serialNumber: "SN-0001",
      assetTag: "AT-0001",
      modelId: model.id,
      ownerSchoolId: ps101.id,
    },
    update: {},
  });
  const device2 = await prisma.device.upsert({
    where: { serialNumber: "SN-0002" },
    create: {
      serialNumber: "SN-0002",
      assetTag: "AT-0002",
      modelId: model.id,
      ownerSchoolId: ms220.id,
    },
    update: {},
  });

  // Tickets in a few different states.
  //
  // Note: at least one ticket must be assigned, otherwise the manager
  // "All benches" view (/bench?scope=all) has nothing to bucket and
  // looks like the page is broken. Assign INC1000003 to the seeded
  // ADMIN so that view has demonstrable data on first run.
  const adminUserId = createdUsers[Role.ADMIN];
  const techUserId = createdUsers[Role.TECHNICIAN];
  const ticketSeeds: {
    incidentNumber: string;
    schoolId: string;
    deviceId: string;
    state: TicketState;
    shortDescription: string;
    assignedUserId?: string;
  }[] = [
    {
      incidentNumber: "INC1000001",
      schoolId: ps101.id,
      deviceId: device1.id,
      state: "AWAITING_PICKUP",
      shortDescription: "Chromebook won't boot",
    },
    {
      incidentNumber: "INC1000002",
      schoolId: ms220.id,
      deviceId: device2.id,
      state: "IN_WAREHOUSE",
      shortDescription: "Cracked screen",
      assignedUserId: techUserId,
    },
    {
      incidentNumber: "INC1000003",
      schoolId: ps101.id,
      deviceId: device1.id,
      state: "QUOTE_REQUIRED",
      shortDescription: "Liquid damage — OOW",
      assignedUserId: adminUserId,
    },
  ];

  for (const t of ticketSeeds) {
    const existing = await prisma.ticket.findUnique({
      where: { incidentNumber: t.incidentNumber },
    });
    if (existing) continue;
    const ticket = await prisma.ticket.create({
      data: {
        incidentNumber: t.incidentNumber,
        schoolId: t.schoolId,
        deviceId: t.deviceId,
        reportedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
        shortDescription: t.shortDescription,
        state: t.state,
        priority: "NORMAL",
        assignedUserId: t.assignedUserId ?? null,
      },
    });
    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        fromState: null,
        toState: t.state,
        reason: "Seeded",
      },
    });
  }

  // Round-10 §2H + Round-11 §1E — first-run auto-seed defaults.
  // The shared seedDefaults() in prisma/seed-defaults.ts owns the
  // EmailTemplate / EmailRule / Holiday rows so production can
  // backfill them via `npm run db:seed:defaults` without dragging
  // in dev fixtures.
  const r = await seedDefaults(prisma);
  console.log(
    `[seed] defaults: templates=${r.templatesUpserted} ruleCreated=${r.ruleCreated} holidaysCreated=${r.holidaysCreated} year=${r.year}`,
  );
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
