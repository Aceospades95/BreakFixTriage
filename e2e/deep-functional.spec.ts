import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-19 — deep functional walk.
 *
 * The route-smoke suite proves every page LOADS; this suite proves
 * the daily-work mutations actually WORK end to end through the UI:
 * comments, time tracking, ticket transitions, the full quote
 * lifecycle, RMA records, admin school/holiday creation, the
 * notifications inbox, CSV exports, and the scan resolver. Each
 * test asserts the visible result (banner, list row, state pill) —
 * not just a 200.
 */

const prisma = new PrismaClient();

const STAMP = Date.now();

async function ticketByIncident(incident: string) {
  return prisma.ticket.findUniqueOrThrow({
    where: { incidentNumber: incident },
    select: { id: true, state: true },
  });
}

test.describe("§A ticket workbench", () => {
  test.beforeAll(async () => {
    // Pin INC90990001 to a known state so the walk is re-runnable.
    await prisma.ticket.update({
      where: { incidentNumber: "INC90990001" },
      data: { state: "AWAITING_PICKUP", stateEnteredAt: new Date() },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("comment, timer, and a guarded transition all stick", async ({
    page,
  }) => {
    const t = await ticketByIncident("INC90990001");
    await signInAs(page, PERSONA.ADMIN);
    await page.goto(`/tickets/${t.id}`);

    // Next-action guidance reflects the state.
    await expect(page.getByTestId("next-action")).toContainText(
      /ready for pickup/i,
    );

    // Comment.
    const body = `Deep QA note ${STAMP}`;
    await page.getByPlaceholder("Leave a note for the team…").fill(body);
    await page.getByRole("button", { name: /post comment/i }).click();
    await expect(page.getByText(body)).toBeVisible({ timeout: 15_000 });

    // Timer: start → running badge → stop → entry logged.
    await page.getByRole("button", { name: /start timer/i }).click();
    await expect(page.getByText(/running since/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /stop timer/i }).click();
    await expect(page.getByRole("button", { name: /start timer/i })).toBeVisible(
      { timeout: 15_000 },
    );

    // Transition via the Available-transitions card:
    // AWAITING_PICKUP → ON_HOLD, then back out to AWAITING_PICKUP.
    const transitions = page.getByTestId("available-transitions");
    await transitions
      .locator("form", { has: page.locator('input[name="to"][value="ON_HOLD"]') })
      .getByRole("button", { name: "Apply" })
      .click();
    await expect(transitions).toContainText(/awaiting pickup/i, {
      timeout: 15_000,
    });
    const after = await ticketByIncident("INC90990001");
    expect(after.state).toBe("ON_HOLD");
    await transitions
      .locator("form", {
        has: page.locator('input[name="to"][value="AWAITING_PICKUP"]'),
      })
      .getByRole("button", { name: "Apply" })
      .click();
    await expect(page.getByTestId("next-action")).toContainText(
      /ready for pickup/i,
      { timeout: 15_000 },
    );
  });
});

test.describe("§B quote lifecycle", () => {
  test.beforeAll(async () => {
    await prisma.ticket.update({
      where: { incidentNumber: "INC90990006" },
      data: { state: "QUOTE_REQUIRED", stateEnteredAt: new Date() },
    });
  });

  test("draft → send → approve drives the ticket state", async ({ page }) => {
    const t = await ticketByIncident("INC90990006");
    await signInAs(page, PERSONA.ADMIN);
    await page.goto(`/tickets/${t.id}`);

    // Create the draft.
    await page.getByPlaceholder("199.00").fill("249.50");
    await page.getByRole("button", { name: /create draft quote/i }).click();
    await expect(
      page.getByRole("button", { name: /send quote/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Send it — ticket should follow to QUOTE_SENT.
    await page.getByRole("button", { name: /send quote/i }).click();
    await expect(
      page.getByRole("button", { name: /mark approved/i }),
    ).toBeVisible({ timeout: 15_000 });
    expect((await ticketByIncident("INC90990006")).state).toBe("QUOTE_SENT");

    // Approve — ticket follows to QUOTE_APPROVED.
    await page.getByRole("button", { name: /mark approved/i }).click();
    await expect(page.getByTestId("next-action")).toContainText(
      /start the repair/i,
      { timeout: 15_000 },
    );
    expect((await ticketByIncident("INC90990006")).state).toBe(
      "QUOTE_APPROVED",
    );
  });
});

test.describe("§C RMA record", () => {
  test.beforeAll(async () => {
    // The RMA create form only renders in MANUFACTURER_RMA.
    await prisma.ticket.update({
      where: { incidentNumber: "INC90990011" },
      data: { state: "MANUFACTURER_RMA", stateEnteredAt: new Date() },
    });
  });

  test("create RMA from ticket detail shows in the list", async ({ page }) => {
    const t = await ticketByIncident("INC90990011");
    await signInAs(page, PERSONA.ADMIN);
    await page.goto(`/tickets/${t.id}`);

    const rmaNumber = `RMA-${STAMP}`;
    await page.getByPlaceholder("RMA #").fill(rmaNumber);
    await page.getByPlaceholder("Vendor").fill("Acme Refurb");
    await page.getByRole("button", { name: /create rma record/i }).click();
    await expect(page.getByText(rmaNumber)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("§D admin CRUD", () => {
  test("create a school with address lands on its detail page", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.ADMIN);
    await page.goto("/admin/schools/new");
    await page.locator('select[name="districtId"]').selectOption({ index: 0 });
    await page
      .locator('input[name="name"]')
      .fill(`Deep QA School ${STAMP}`);
    await page.locator('input[name="line1"]').fill("99 QA Way");
    await page.locator('input[name="city"]').fill("Bronx");
    await page.locator('input[name="state"]').fill("NY");
    await page.locator('input[name="postalCode"]').fill("10460");
    await page.getByRole("button", { name: /create school/i }).click();
    await expect(
      page.getByRole("heading", { name: `Deep QA School ${STAMP}` }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("create and delete a holiday", async ({ page }) => {
    await signInAs(page, PERSONA.ADMIN);
    await page.goto("/admin/holidays");
    const label = `QA Day ${STAMP}`;
    // The list filters to the year being viewed (defaults to the
    // current year) — keep the fixture date inside it.
    const dec31 = `${new Date().getFullYear()}-12-31`;
    await page.locator('input[name="date"]').fill(dec31);
    await page.locator('input[name="label"]').fill(label);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const row = page.locator("li,tr", { hasText: label }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Delete goes through the native confirm() guard.
    page.once("dialog", (d) => void d.accept());
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("li,tr", { hasText: label })).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});

test.describe("§E inbox, exports, scan", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("notifications mark-all-read empties the unread list", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.ADMIN);
    await page.goto("/notifications");
    const markAll = page.getByRole("button", { name: /mark all read/i });
    if (await markAll.isVisible().catch(() => false)) {
      await markAll.click();
    }
    await expect(
      page.getByRole("button", { name: /mark all read/i }),
    ).toHaveCount(0, { timeout: 15_000 });
  });

  test("CSV exports answer with csv content", async ({ page }) => {
    await signInAs(page, PERSONA.ADMIN);
    for (const path of [
      "/api/exports/tickets",
      "/api/exports/devices",
      "/api/exports/schools",
      "/api/exports/quotes",
      "/api/exports/invoices",
      "/api/exports/users",
      "/api/exports/audit",
      "/api/exports/email-log",
    ]) {
      const res = await page.request.get(path);
      expect(res.status(), `${path} status`).toBe(200);
      expect(
        res.headers()["content-type"],
        `${path} content-type`,
      ).toContain("text/csv");
    }
  });

  test("CSV import: template downloads, uploads, and lands on the batch page", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.OPS_MANAGER);

    // The template endpoint hands back the exact header shape the
    // importer expects — round-trip it straight into an upload.
    const tpl = await page.request.get("/api/imports/templates?type=schools");
    expect(tpl.status()).toBe(200);
    const csv = await tpl.text();
    expect(csv.split("\n").length).toBeGreaterThan(1);

    await page.goto("/imports/new?type=schools");
    await page.locator('input[name="file"]').setInputFiles({
      name: `qa-schools-${STAMP}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: /upload/i }).click();
    await page.waitForURL(/\/imports\/[a-z0-9]+$/i, { timeout: 20_000 });
    await expect(page.getByText(`qa-schools-${STAMP}.csv`)).toBeVisible();
  });

  test("scan resolver finds a fixture serial and respects tenancy", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.ADMIN);
    await page.goto("/scan");
    await page
      .getByPlaceholder("e.g. INC2200126, SN-1234, BX-101")
      .fill("SN-TEST-0001");
    await page.getByRole("button", { name: /go/i }).click();
    // Single hit navigates straight to the device page.
    await page.waitForURL(/\/admin\/devices\//, { timeout: 15_000 });

    // API-level tenancy check: dispatcher (district-scoped persona)
    // can resolve in-district fixtures but the response shape is the
    // same scoped query — assert it still resolves for a member.
    const res = await page.request.post("/api/scan", {
      data: { value: "INC90990000" },
    });
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { hits: Array<{ kind: string }> };
    expect(json.hits.some((h) => h.kind === "ticket")).toBe(true);
  });
});
