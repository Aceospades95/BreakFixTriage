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

  test("valid bulk transition confirms, shows success banner, keeps filters", async ({
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
    // Round-22 — a bulk status change now requires a reason (matches the
    // ticket page's force-change guardrail).
    await page.locator('input[name="reason"]').fill("Bulk hold for review");
    // Round-21 — selection-aware hint renders before anything fires.
    await expect(page.getByTestId("bulk-eligibility-hint")).toContainText(
      /All 2 selected can move/i,
    );
    // Round-21 — bulk transitions confirm before applying.
    page.once("dialog", (d) => {
      expect(d.message()).toContain("Move 2 tickets");
      void d.accept();
    });
    await page.getByRole("button", { name: "Apply", exact: true }).first().click();

    // .first(): the summary renders as both the page banner and the
    // toast until the toast strips the query param.
    await expect(page.getByText(/Moved 2\/2 to On hold/i).first()).toBeVisible({
      timeout: 15_000,
    });
    // The active filter must survive the redirect — this is exactly
    // where the old string concat corrupted the URL.
    expect(page.url()).toContain("state=TRIAGE");
  });

  test("declining the confirm leaves every ticket untouched", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.DISPATCHER);
    await page.goto("/tickets?state=TRIAGE");

    const boxes = page.locator('input[type="checkbox"][name="ticketIds"]');
    await expect(boxes.first()).toBeVisible();
    await boxes.nth(0).check();
    await page.locator('select[name="to"]').selectOption("ON_HOLD");
    page.once("dialog", (d) => void d.dismiss());
    await page.getByRole("button", { name: "Apply", exact: true }).first().click();

    // No navigation, no banner — and the fixture stays in TRIAGE.
    await expect(page.getByText(/Moved \d/)).toHaveCount(0);
    const still = await prisma.ticket.findFirst({
      where: { incidentNumber: TRIAGE_FIXTURES[0] },
      select: { state: true },
    });
    expect(still?.state).toBe("TRIAGE");
  });

  test("impossible bulk transition is blocked before it fires", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.DISPATCHER);
    await page.goto("/tickets?state=CLOSED");

    const boxes = page.locator('input[type="checkbox"][name="ticketIds"]');
    await expect(boxes.first()).toBeVisible();
    await boxes.nth(0).check();
    await boxes.nth(1).check();

    // CLOSED only reopens — ON_HOLD is not a legal edge for any
    // selected row. Round-21: the option itself is disabled, so the
    // misuse can't even be submitted from the UI (the server-side
    // per-ticket guard still backstops non-JS posts).
    // toHaveJSProperty rather than toBeDisabled — Playwright's
    // disabled-state matcher misreports <option> elements.
    const onHold = page.locator('select[name="to"] option[value="ON_HOLD"]');
    await expect(onHold).toHaveJSProperty("disabled", true);
    await expect(onHold).toHaveText(/0 of 2/);
    // Reopened applies to all selected — offered with a count.
    const reopened = page.locator(
      'select[name="to"] option[value="REOPENED"]',
    );
    await expect(reopened).toHaveJSProperty("disabled", false);
    await expect(reopened).toHaveText(/all 2/i);
  });
});
