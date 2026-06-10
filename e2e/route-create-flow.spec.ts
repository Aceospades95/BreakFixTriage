import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-17 — the route-creation golden path, end to end, exactly
 * as a dispatcher drives it. This flow is the heart of scheduling
 * and the subject of the field QA report that triggered R17
 * ("I click a button and don't see a route"):
 *
 *   /scheduling → "Schedule N → build route" → builder (stop
 *   staged + guidance banner) → pick driver → save → route detail
 *   with success banner and PICKUP_SCHEDULED tickets.
 */

const prisma = new PrismaClient();

test.describe("route creation golden path", () => {
  test.beforeAll(async () => {
    // Deterministic fixture: two free AWAITING_PICKUP tickets and
    // no leftover staged jobs from prior runs.
    await prisma.job.deleteMany({ where: { status: "UNSCHEDULED" } });
    await prisma.ticket.updateMany({
      where: { incidentNumber: { in: ["INC90990010", "INC90990015"] } },
      data: { state: "AWAITING_PICKUP", stateEnteredAt: new Date() },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("dispatcher schedules tickets into a saved route in two clicks", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.DISPATCHER);

    // 1 — dashboard shows the ready group with the explicit label.
    await page.goto("/scheduling");
    const scheduleBtn = page
      .getByRole("button", { name: /schedule \d+ → build route/i })
      .first();
    await expect(scheduleBtn).toBeVisible();

    // 2 — clicking lands ON THE BUILDER (not back on /scheduling)
    // with the stop staged and the guidance banner shown.
    await scheduleBtn.click();
    await page.waitForURL(/\/scheduling\/routes\/new/, { timeout: 15_000 });
    await expect(page.getByText(/pick a driver below/i).first()).toBeVisible();
    expect(
      await page.locator('input[name="jobIds"]').count(),
    ).toBeGreaterThanOrEqual(1);

    // 3 — driver + save → route detail with the success banner.
    await page.locator('select[name="assigneeUserId"]').selectOption({
      index: 1,
    });
    await page
      .getByRole("button", { name: /optimize.*save route/i })
      .click();
    await page.waitForURL(/\/scheduling\/routes\/(?!new)[a-z0-9]+/, {
      timeout: 15_000,
    });
    await expect(page.getByText(/route created/i).first()).toBeVisible();

    // 4 — the linked tickets advanced to PICKUP_SCHEDULED.
    await expect(
      page.getByText(/pickup scheduled/i).first(),
    ).toBeVisible();
  });

  test("builder explains the flow instead of dead-ending when empty", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.DISPATCHER);
    await page.goto("/scheduling/routes/new");
    // Either the staged-jobs form or the explainer renders — never
    // a bare dead end.
    const hasForm = await page
      .locator('input[name="jobIds"]')
      .count()
      .then((n) => n > 0);
    if (!hasForm) {
      await expect(
        page.getByText(/how routes come together/i),
      ).toBeVisible();
    }
  });
});
