import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-18 §1 — bulk apply feedback regression.
 *
 * The reported bug: "selecting tickets and hitting Apply does
 * nothing." The actions actually ran — the redirect appended `?ok=`
 * to a returnTo that already carried the list's filter query string,
 * so the summary param was swallowed into the previous filter value
 * and no banner ever rendered. These specs pin the fixed behaviour:
 * a visible success banner (with the filter preserved), and an
 * error-styled banner that says WHY when nothing could move.
 */

const prisma = new PrismaClient();

// i % 5 === 0 tickets seed as TRIAGE (see prisma/seed-test.ts).
const TRIAGE_FIXTURES = ["INC90990000", "INC90990005"];

test.describe("§1 bulk actions feedback", () => {
  test.beforeEach(async () => {
    // Pin the two fixture tickets back to TRIAGE so the spec is
    // re-runnable without reseeding (the success path moves them).
    await prisma.ticket.updateMany({
      where: { incidentNumber: { in: TRIAGE_FIXTURES } },
      data: { state: "TRIAGE", stateEnteredAt: new Date() },
    });
  });

  test.afterAll(async () => {
    await prisma.ticket.updateMany({
      where: { incidentNumber: { in: TRIAGE_FIXTURES } },
      data: { state: "TRIAGE", stateEnteredAt: new Date() },
    });
    await prisma.$disconnect();
  });

  test("valid bulk transition shows success banner and keeps filters", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.DISPATCHER);
    await page.goto("/tickets?state=TRIAGE");

    const boxes = page.locator('input[type="checkbox"][name="ticketIds"]');
    await expect(boxes.first()).toBeVisible();
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.getByTestId("bulk-actions")).toContainText(
      "(2 selected)",
    );

    // TRIAGE → ON_HOLD is a legal edge for every selected ticket.
    await page.locator('select[name="to"]').selectOption("ON_HOLD");
    await page.getByRole("button", { name: "Apply", exact: true }).first().click();

    await expect(page.getByText(/Moved 2\/2 to On hold/i)).toBeVisible({
      timeout: 15_000,
    });
    // The active filter must survive the redirect — this is exactly
    // where the old string concat corrupted the URL.
    expect(page.url()).toContain("state=TRIAGE");
  });

  test("impossible bulk transition shows an error banner that says why", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.DISPATCHER);
    await page.goto("/tickets?state=CLOSED");

    const boxes = page.locator('input[type="checkbox"][name="ticketIds"]');
    await expect(boxes.first()).toBeVisible();
    await boxes.nth(0).check();
    await boxes.nth(1).check();

    // CLOSED only reopens — ON_HOLD is not a legal edge, so every
    // selected ticket gets skipped.
    await page.locator('select[name="to"]').selectOption("ON_HOLD");
    await page.getByRole("button", { name: "Apply", exact: true }).first().click();

    const banner = page.getByText(/No tickets moved/i);
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText(
      /not allowed to go to On hold from their current state/i,
    );
  });
});
