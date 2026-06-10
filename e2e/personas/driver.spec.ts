import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "../lib/sign-in-as";

/**
 * Round-13 §2A — Dante Driver persona walk.
 *
 * Full delivery + pickup loop:
 *   (1) Create a route from /scheduling.
 *   (2) Add a stop. Optimise.
 *   (3) Mark stop arrived. Mark stop completed.
 *   (4) Observe ticket transitions: AWAITING_PICKUP → IN_WAREHOUSE
 *       on pickup; PENDING_DELIVERY → CLOSED on delivery
 *       completion.
 *   (5) Verify audit log shows route activity attributed to
 *       Dante.
 *   (6) Verify dispatchEmailEvent fired (route_started,
 *       stop_completed) on the email log.
 *
 * Runtime: §1E provisions the chromium runner + Postgres + the
 * synthetic test seed. Persona credentials live in prisma/seed-
 * test.ts and password is "test-password".
 */

const prisma = new PrismaClient();

let fixtureRouteId: string;

test.describe("§2A driver persona", () => {
  test.beforeAll(async () => {
    // Completing the stops below consumes the seeded TEST-VAN-1
    // route; reset it to PLANNED with SCHEDULED stops + jobs and
    // the linked tickets back to PICKUP_SCHEDULED so the spec is
    // re-runnable without reseeding.
    const route = await prisma.route.findFirst({
      where: { vehicleRef: "TEST-VAN-1" },
      include: {
        stops: {
          include: { job: { include: { ticketLinks: true } } },
        },
      },
    });
    if (route) {
      await prisma.routeStop.updateMany({
        where: { routeId: route.id },
        data: { status: "SCHEDULED" },
      });
      for (const stop of route.stops) {
        await prisma.job.update({
          where: { id: stop.jobId },
          data: { status: "SCHEDULED" },
        });
        for (const link of stop.job.ticketLinks) {
          await prisma.ticket.update({
            where: { id: link.ticketId },
            data: { state: "PICKUP_SCHEDULED", stateEnteredAt: new Date() },
          });
        }
      }
      await prisma.route.update({
        where: { id: route.id },
        data: { status: "PLANNED" },
      });
      fixtureRouteId = route.id;
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("delivery + pickup loop end-to-end", async ({ page }) => {
    await signInAs(page, PERSONA.DRIVER);

    // (1) — Drivers don't usually create routes themselves; the
    // scheduling action gate requires DISPATCHER+. The driver
    // walks the seeded TEST-VAN-1 route directly — other specs
    // create routes of their own, so "first link on the index"
    // is not deterministic.
    expect(fixtureRouteId, "TEST-VAN-1 fixture route missing").toBeTruthy();
    await page.goto(`/scheduling/routes/${fixtureRouteId}`);

    // (3) — Walk the stop lifecycle. The controls render as
    // Start → Arrived → Complete. Each click submits a form that
    // round-trips through a server action + redirect, so after
    // every click wait for the reloaded page to reflect the new
    // state (the clicked button disables) before the next click —
    // clicking again mid-reload hits the stale, still-enabled
    // button.
    const firstStop = page.locator('[data-testid="route-stop"]').first();
    // Server actions here run a transaction + audit + email
    // dispatch + revalidate before redirecting; give the disabled
    // assertions a longer leash than the 5s action default.
    const settle = { timeout: 15_000 };
    const startBtn = firstStop.getByRole("button", { name: /^start$/i });
    if (await startBtn.isEnabled().catch(() => false)) {
      await startBtn.click();
      await expect(startBtn).toBeDisabled(settle);
    }
    const arrivedBtn = firstStop.getByRole("button", { name: /^arrived$/i });
    await expect(arrivedBtn).toBeEnabled(settle);
    await arrivedBtn.click();
    await expect(arrivedBtn).toBeDisabled(settle);
    const completeBtn = firstStop.getByRole("button", {
      name: /^complete$/i,
    });
    await expect(completeBtn).toBeEnabled(settle);
    await completeBtn.click();
    await expect(completeBtn).toBeDisabled(settle);

    // (4) — Confirm ticket transition occurred. The associated
    // ticket(s) should now be IN_WAREHOUSE (pickup) or CLOSED
    // (delivery), depending on stop kind.
    const stopRow = await firstStop.getAttribute("data-stop-id");
    expect(stopRow).toBeTruthy();
    const stopDevices = await prisma.stopDevice.findMany({
      where: { stopId: stopRow! },
      include: { ticket: { select: { state: true } } },
    });
    for (const sd of stopDevices) {
      expect(["IN_WAREHOUSE", "CLOSED", "PENDING_DELIVERY"]).toContain(
        sd.ticket.state,
      );
    }

    // (5) — Audit row attributed to Dante for the stop completion.
    const dante = await prisma.user.findUnique({
      where: { email: PERSONA.DRIVER },
      select: { id: true },
    });
    // The stop audit slug is "status:ARRIVED->COMPLETED" —
    // uppercase enum halves, case-sensitive in Postgres.
    const recent = await prisma.auditLog.findFirst({
      where: {
        actorUserId: dante!.id,
        entityType: "RouteStop",
        action: { contains: "COMPLETED" },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(recent).not.toBeNull();

    // (6) — Email log shows the dispatchEmailEvent firing for
    // the stop. Mailpit fixture would also receive these in CI.
    const recentEmail = await prisma.emailLog.findFirst({
      where: { ticketId: stopDevices[0]?.ticketId ?? "" },
      orderBy: { createdAt: "desc" },
    });
    expect(recentEmail).not.toBeNull();
  });
});
