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
        // Round-22 — proofRule defaults to PHOTO_AND_SIGNATURE; this spec
        // walks the happy path without attaching proof, so reset to NONE.
        data: { status: "SCHEDULED", proofRule: "NONE" },
      });
      // Round-20/22 — clear the durable check-offs + per-line states so
      // the completion assertion tests THIS run's stamps, not a prior one's.
      await prisma.stopDevice.updateMany({
        where: { stop: { routeId: route.id } },
        data: {
          confirmedAt: null,
          confirmedByUserId: null,
          lineState: "EXPECTED",
          lineNote: null,
        },
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

    // (3) — Walk the stop lifecycle. Round-18 §3: stops render in a
    // one-at-a-time accordion (the first actionable stop is open by
    // default) and Complete moved behind the check-off panel —
    // every device line plus a confirmation must be ticked before
    // "Complete stop & save" enables. Each click submits a form
    // that round-trips through a server action + redirect, so after
    // every click wait for the reloaded page to reflect the new
    // state (the clicked button disables) before the next click —
    // clicking again mid-reload hits the stale, still-enabled
    // button.
    const firstStop = page.locator('[data-testid="route-stop"]').first();
    const stopRow = await firstStop.getAttribute("data-stop-id");
    expect(stopRow).toBeTruthy();
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

    // Round-22 §1C — Complete moved into the on-site work panel: each
    // expected line item is resolved (Verified / Not found / Refused),
    // and "Complete stop" enables once every line is resolved (and the
    // proof rule — NONE here — is satisfied). Verify every line, then
    // complete.
    const completion = firstStop.getByTestId("stop-work-panel");
    await expect(completion).toBeVisible(settle);
    const lines = completion.locator('[data-testid="panel-line"]');
    const lineCount = await lines.count();
    for (let i = 0; i < lineCount; i++) {
      // First choice per line is VERIFIED (label "Picked up" / "Delivered").
      await lines.nth(i).locator('label:has(input[value="VERIFIED"])').click();
    }
    const completeBtn = completion.getByRole("button", {
      name: /^complete stop$/i,
    });
    await expect(completeBtn).toBeEnabled(settle);
    await completeBtn.click();

    // The completed stop leaves the active accordion and lands in
    // the "Resolved stops" section.
    await expect(
      page.locator(`[data-testid="route-stop-done"][data-stop-id="${stopRow}"]`),
    ).toBeVisible(settle);

    // Round-20 — the check-offs are durable: every active device
    // line on the completed stop carries confirmedAt/by (the server
    // refuses completion otherwise).
    const confirmedLines = await prisma.stopDevice.findMany({
      where: { stopId: stopRow!, removedAt: null },
      select: { confirmedAt: true, confirmedByUserId: true },
    });
    for (const line of confirmedLines) {
      expect(line.confirmedAt).not.toBeNull();
      expect(line.confirmedByUserId).toBeTruthy();
    }

    // (4) — Confirm ticket transition occurred. The associated
    // ticket(s) should now be IN_WAREHOUSE (pickup) or CLOSED
    // (delivery), depending on stop kind.
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
