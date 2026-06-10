/**
 * Round-12 §1E — synthetic test seed for Playwright + integration.
 *
 * 7 personas (one per role) at known emails / known password +
 * 5 schools, 50 devices, 20 tickets, 1 route, 1 quote. Small
 * enough to seed in <5s; representative enough to exercise every
 * UI surface the persona specs walk.
 *
 * Persona credentials:
 *   alex@example.test   ADMIN
 *   olivia@example.test OPS_MANAGER
 *   dana@example.test   DISPATCHER
 *   tess@example.test   TECHNICIAN
 *   wes@example.test    WAREHOUSE
 *   dante@example.test  DRIVER
 *   ray@example.test    READ_ONLY
 *
 * All seeded with password "test-password" (bcrypt hash baked in).
 *
 * Idempotent. Re-running upserts every row.
 */

import { PrismaClient, Role, TicketState, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDefaults } from "./seed-defaults";

const prisma = new PrismaClient();

const PERSONAS: Array<{ email: string; name: string; role: Role }> = [
  { email: "alex@example.test", name: "Alex Admin", role: Role.ADMIN },
  { email: "olivia@example.test", name: "Olivia Ops", role: Role.OPS_MANAGER },
  { email: "dana@example.test", name: "Dana Dispatcher", role: Role.DISPATCHER },
  { email: "tess@example.test", name: "Tess Technician", role: Role.TECHNICIAN },
  { email: "wes@example.test", name: "Wes Warehouse", role: Role.WAREHOUSE },
  { email: "dante@example.test", name: "Dante Driver", role: Role.DRIVER },
  { email: "ray@example.test", name: "Ray ReadOnly", role: Role.READ_ONLY },
];


/**
 * Round-15 — the seed-defaults idempotency invariant requires every
 * seeded EmailRule to carry a `system_seed` audit row (so a future
 * audit walk can tell seeded from operator-added rules). Mirror it
 * for the rules this synthetic seed creates.
 */
async function writeSeedAudit(
  entityType: string,
  entityId: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  const existing = await prisma.auditLog.findFirst({
    where: { entityType, entityId, action: "system_seed" },
    select: { id: true },
  });
  if (existing) return;
  await prisma.auditLog.create({
    data: {
      actorUserId: null,
      entityType,
      entityId,
      action: "system_seed",
      after: payload,
      transitionType: "system_seed",
    },
  });
}

async function main() {
  console.log("[seed-test] Synthetic test fixture…");

  // Defaults first (templates / rules / holidays).
  await seedDefaults(prisma);

  // Personas.
  const passwordHash = await bcrypt.hash("test-password", 10);
  for (const p of PERSONAS) {
    await prisma.user.upsert({
      where: { email: p.email },
      create: {
        email: p.email,
        name: p.name,
        passwordHash,
        role: p.role,
        active: true,
      },
      update: {
        name: p.name,
        role: p.role,
        active: true,
        passwordHash,
      },
    });
  }
  console.log(`[seed-test] ${PERSONAS.length} personas upserted`);

  // 1 district, 5 schools.
  const district = await prisma.district.upsert({
    where: { code: "BX-TEST" },
    create: { code: "BX-TEST", name: "Test District", region: "NYC" },
    update: {},
  });
  // Round-16 (B17) — every persona belongs to the test district so
  // tenant-scoped queries (ticketWhereForSession and friends) match
  // the fixture data for non-admin roles.
  const personaRows = await prisma.user.findMany({
    where: { email: { in: PERSONAS.map((p) => p.email) } },
    select: { id: true },
  });
  await prisma.districtUser.createMany({
    data: personaRows.map((u) => ({
      districtId: district.id,
      userId: u.id,
    })),
    skipDuplicates: true,
  });

  const schoolSlugs = ["TEST-101", "TEST-102", "TEST-201", "TEST-301", "TEST-401"];
  const schools = [];
  for (const code of schoolSlugs) {
    const s = await prisma.school.upsert({
      where: { code },
      create: { code, name: `Test School ${code}`, districtId: district.id },
      update: {},
    });
    schools.push(s);
  }

  // 1 device model + 50 devices distributed across schools.
  const model = await prisma.deviceModel.upsert({
    where: {
      manufacturer_modelName: { manufacturer: "Acme", modelName: "EduBook 14" },
    },
    create: {
      manufacturer: "Acme",
      modelName: "EduBook 14",
      formFactor: "LAPTOP",
    },
    update: {},
  });
  for (let i = 0; i < 50; i++) {
    const serial = `SN-TEST-${String(i + 1).padStart(4, "0")}`;
    const owner = schools[i % schools.length]!;
    await prisma.device.upsert({
      where: { serialNumber: serial },
      create: {
        serialNumber: serial,
        modelId: model.id,
        ownerSchoolId: owner.id,
      },
      update: {},
    });
  }

  // 20 tickets across personas + schools, mixed states.
  const ticketStates: TicketState[] = [
    "TRIAGE",
    "AWAITING_PICKUP",
    "IN_REPAIR",
    "AWAITING_PARTS",
    "CLOSED",
  ];
  const tess = await prisma.user.findUnique({
    where: { email: "tess@example.test" },
  });
  for (let i = 0; i < 20; i++) {
    const incidentNumber = `INC9${String(990000 + i).padStart(7, "0")}`;
    const school = schools[i % schools.length]!;
    const state = ticketStates[i % ticketStates.length]!;
    // Device i is owned by schools[i % 5] — same modulus as the
    // ticket — so the linked device always matches the school.
    const serial = `SN-TEST-${String(i + 1).padStart(4, "0")}`;
    const device = await prisma.device.findUnique({
      where: { serialNumber: serial },
      select: { id: true },
    });
    await prisma.ticket.upsert({
      where: { incidentNumber },
      create: {
        incidentNumber,
        shortDescription: `Test ticket ${i + 1} — synthetic fixture`,
        state,
        priority: "NORMAL",
        schoolId: school.id,
        deviceId: device?.id ?? null,
        reportedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        stateEnteredAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        assignedUserId: i % 4 === 0 ? tess?.id : null,
      },
      update: { deviceId: device?.id ?? null },
    });
  }

  // 1 route for Dante with 2 pickup stops — the header has promised
  // this fixture since R12 but it was never written (found in the
  // R14 audit; the driver persona spec depends on it). Idempotent:
  // keyed on a fixed vehicleRef tag.
  const dante = await prisma.user.findUniqueOrThrow({
    where: { email: "dante@example.test" },
    select: { id: true },
  });
  const existingRoute = await prisma.route.findFirst({
    where: { vehicleRef: "TEST-VAN-1", assigneeUserId: dante.id },
    select: { id: true },
  });
  if (!existingRoute) {
    const pickupTickets = await prisma.ticket.findMany({
      where: {
        incidentNumber: { startsWith: "INC9" },
        state: "AWAITING_PICKUP",
      },
      orderBy: { incidentNumber: "asc" },
      take: 2,
      select: { id: true, schoolId: true, deviceId: true },
    });
    if (pickupTickets.length > 0) {
      const route = await prisma.route.create({
        data: {
          date: new Date(),
          assigneeUserId: dante.id,
          vehicleRef: "TEST-VAN-1",
          status: "PLANNED",
        },
      });
      let seq = 1;
      for (const t of pickupTickets) {
        const job = await prisma.job.create({
          data: {
            type: "PICKUP",
            schoolId: t.schoolId,
            status: "SCHEDULED",
            ticketLinks: { create: { ticketId: t.id } },
          },
        });
        const stop = await prisma.routeStop.create({
          data: {
            routeId: route.id,
            jobId: job.id,
            sequence: seq++,
            status: "SCHEDULED",
          },
        });
        if (t.deviceId) {
          await prisma.stopDevice.create({
            data: {
              stopId: stop.id,
              deviceId: t.deviceId,
              ticketId: t.id,
              purpose: "PICKUP",
              addedByUserId: dante.id,
            },
          });
        }
        // The real route-build flow transitions a ticket to
        // PICKUP_SCHEDULED when its job lands on a route; mirror
        // that here so stop completion can cascade the ticket to
        // IN_WAREHOUSE (AWAITING_PICKUP → IN_WAREHOUSE is not a
        // legal edge).
        await prisma.ticket.update({
          where: { id: t.id },
          data: { state: "PICKUP_SCHEDULED", stateEnteredAt: new Date() },
        });
      }
      console.log(
        `[seed-test] route ${route.id} created with ${pickupTickets.length} stops`,
      );
    }
  }

  // Round-15 — quick-create + notification-dispatch fixtures:
  // a TicketTemplate (the /tickets quick-create form only renders
  // when one exists), a SPOC contact on TEST-101 opted into ticket
  // emails, and an enabled GLOBAL ticket_created rule so a UI
  // ticket creation exercises the full dispatch path.
  await prisma.ticketTemplate.upsert({
    where: { name: "Cracked screen (test)" },
    create: {
      name: "Cracked screen (test)",
      shortDescription: "Cracked screen — synthetic fixture",
      priority: "NORMAL",
      active: true,
    },
    update: { active: true },
  });
  const spocSchool = schools[0]!;
  const spocEmail = "spoc-test101@example.test";
  const existingSpoc = await prisma.contact.findFirst({
    where: { schoolId: spocSchool.id, email: spocEmail },
    select: { id: true },
  });
  if (!existingSpoc) {
    await prisma.contact.create({
      data: {
        schoolId: spocSchool.id,
        name: "Sam Spoc",
        email: spocEmail,
        receivesTicketEmails: true,
      },
    });
  }
  const ticketCreatedTemplate = await prisma.emailTemplate.findFirst({
    where: { key: "ticket_created" },
    select: { id: true },
  });
  if (ticketCreatedTemplate) {
    let enabledRule = await prisma.emailRule.findFirst({
      where: { event: "ticket_created", scope: "GLOBAL", enabled: true },
      select: { id: true },
    });
    if (!enabledRule) {
      enabledRule = await prisma.emailRule.create({
        data: {
          scope: "GLOBAL",
          event: "ticket_created",
          recipients: { to: [{ kind: "spoc" }], cc: [], bcc: [] },
          templateId: ticketCreatedTemplate.id,
          enabled: true,
        },
        select: { id: true },
      });
      console.log("[seed-test] ticket_created rule created");
    }
    await writeSeedAudit("EmailRule", enabledRule.id, {
      event: "ticket_created",
      seed: "seed-test",
    });
  }

  // An enabled pickup_completed rule so the driver persona walk
  // exercises the dispatchEmailEvent chokepoint (EmailLog row
  // presence is the assertion until the Mailpit fixture lands —
  // backlog B12). stdout transport means no real send.
  const pickupTemplate = await prisma.emailTemplate.findFirst({
    where: { key: "pickup_completed" },
    select: { id: true },
  });
  if (pickupTemplate) {
    let pickupRule = await prisma.emailRule.findFirst({
      where: { event: "pickup_completed", scope: "GLOBAL" },
      select: { id: true },
    });
    if (!pickupRule) {
      pickupRule = await prisma.emailRule.create({
        data: {
          scope: "GLOBAL",
          event: "pickup_completed",
          recipients: { to: [{ kind: "spoc" }], cc: [], bcc: [] },
          templateId: pickupTemplate.id,
          enabled: true,
        },
        select: { id: true },
      });
      console.log("[seed-test] pickup_completed rule created");
    }
    await writeSeedAudit("EmailRule", pickupRule.id, {
      event: "pickup_completed",
      seed: "seed-test",
    });
  }

  // 1 quote on an IN_REPAIR ticket (same long-promised fixture).
  const quoteTicket = await prisma.ticket.findFirst({
    where: { incidentNumber: { startsWith: "INC9" }, state: "IN_REPAIR" },
    select: { id: true },
  });
  if (quoteTicket) {
    const existingQuote = await prisma.quote.findFirst({
      where: { ticketId: quoteTicket.id },
      select: { id: true },
    });
    if (!existingQuote) {
      await prisma.quote.create({
        data: {
          ticketId: quoteTicket.id,
          status: "SENT",
          amountCents: 12_500,
          sentAt: new Date(),
          notes: "Synthetic fixture quote",
        },
      });
      console.log("[seed-test] quote created");
    }
  }

  console.log("[seed-test] Synthetic fixture ready.");
}

main()
  .catch((err) => {
    console.error("[seed-test] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
