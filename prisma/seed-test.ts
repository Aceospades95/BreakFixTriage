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

import { PrismaClient, Role, TicketState } from "@prisma/client";
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
    where: { id: "test_model_eb14" },
    create: {
      id: "test_model_eb14",
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
    await prisma.ticket.upsert({
      where: { incidentNumber },
      create: {
        incidentNumber,
        shortDescription: `Test ticket ${i + 1} — synthetic fixture`,
        state,
        priority: "NORMAL",
        schoolId: school.id,
        reportedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        stateEnteredAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        assignedUserId: i % 4 === 0 ? tess?.id : null,
      },
      update: {},
    });
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
