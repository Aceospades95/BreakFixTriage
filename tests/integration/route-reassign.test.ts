import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient, RouteStatus } from "@prisma/client";
import { reassignRouteDriver } from "@/lib/scheduling/routes";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Jorge's June-18 notes — "change drivers in the calendar in case one
 * is absent". The service must move the route, audit the change, and
 * notify BOTH drivers; a same-driver call is an idempotent no-op and
 * an inactive/ineligible target is refused.
 *
 * Skipped without DATABASE_URL.
 */

const prisma = new PrismaClient();
const RUN_TAG = `rra-${Date.now()}`;

async function fixtureDriver(n: number, opts: { active?: boolean; role?: "DRIVER" | "READ_ONLY" } = {}) {
  return prisma.user.upsert({
    where: { email: `rra-driver-${n}@integration.test` },
    create: {
      email: `rra-driver-${n}@integration.test`,
      name: `RRA Driver ${n}`,
      role: opts.role ?? "DRIVER",
      active: opts.active ?? true,
    },
    update: { active: opts.active ?? true, role: opts.role ?? "DRIVER" },
  });
}

describe.skipIf(!process.env.DATABASE_URL)("reassignRouteDriver", () => {
  afterAll(async () => {
    await prisma.inAppNotification.deleteMany({
      where: { recipientUser: { email: { startsWith: "rra-driver-" } } },
    });
    await prisma.route.deleteMany({
      where: { assignee: { email: { startsWith: "rra-driver-" } } },
    });
    await prisma.$disconnect();
  });

  it("moves the route, audits, and notifies both drivers", async () => {
    await ensureIntegrationDistrict(prisma);
    const [a, b] = await Promise.all([fixtureDriver(1), fixtureDriver(2)]);
    const route = await prisma.route.create({
      data: {
        date: new Date(),
        assigneeUserId: a.id,
        status: RouteStatus.PLANNED,
      },
    });

    const result = await reassignRouteDriver(
      { routeId: route.id, newAssigneeUserId: b.id, actorUserId: a.id },
      prisma,
    );
    expect(result.changed).toBe(true);
    expect(result.newDriver.id).toBe(b.id);

    const after = await prisma.route.findUniqueOrThrow({
      where: { id: route.id },
    });
    expect(after.assigneeUserId).toBe(b.id);

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: "Route",
        entityId: route.id,
        action: "route.driver.reassigned",
      },
    });
    expect(audit).not.toBeNull();

    const toNew = await prisma.inAppNotification.findFirst({
      where: { recipientUserId: b.id, title: { contains: "is now yours" } },
    });
    expect(toNew).not.toBeNull();
    const toOld = await prisma.inAppNotification.findFirst({
      where: { recipientUserId: a.id, title: { contains: "reassigned to" } },
    });
    expect(toOld).not.toBeNull();
  });

  it("same driver is a no-op; inactive or ineligible targets are refused", async () => {
    const [a] = await Promise.all([fixtureDriver(3)]);
    const inactive = await fixtureDriver(4, { active: false });
    const readonly = await fixtureDriver(5, { role: "READ_ONLY" });
    const route = await prisma.route.create({
      data: {
        date: new Date(),
        assigneeUserId: a.id,
        status: RouteStatus.PLANNED,
      },
    });

    const same = await reassignRouteDriver(
      { routeId: route.id, newAssigneeUserId: a.id, actorUserId: a.id },
      prisma,
    );
    expect(same.changed).toBe(false);

    await expect(
      reassignRouteDriver(
        { routeId: route.id, newAssigneeUserId: inactive.id, actorUserId: a.id },
        prisma,
      ),
    ).rejects.toThrow(/active user/i);

    await expect(
      reassignRouteDriver(
        { routeId: route.id, newAssigneeUserId: readonly.id, actorUserId: a.id },
        prisma,
      ),
    ).rejects.toThrow(/can't be assigned routes/i);

    const still = await prisma.route.findUniqueOrThrow({
      where: { id: route.id },
    });
    expect(still.assigneeUserId).toBe(a.id);
  });
});
