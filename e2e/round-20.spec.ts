import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-20 — NY team feature batch, end to end:
 *
 *  §1 urgent team-note banner + click sign-off
 *  §2 stop delay → chip + SPOC email through the chokepoint
 *  §3 expenses: tech submits → ops approves → CSV export
 *  §4 PO generation from an approved quote → printable sheet
 *  §5 location sorting on /tickets and /admin/schools
 *  §6 my upcoming routes on /me/schedule
 *  §7 pickup_scheduled rule seeded; scheduled-report builders run
 */

const prisma = new PrismaClient();
const STAMP = Date.now();

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Failed earlier runs can leave QA notes active; a live note
  // banners on EVERY page, which would leak into unrelated specs
  // (axe, print sheets). Start clean.
  await prisma.teamNote.updateMany({
    where: { body: { startsWith: "QA urgent note" }, active: true },
    data: { active: false, deactivatedAt: new Date() },
  });
});

test.afterAll(async () => {
  // Same hygiene on the way out, even if §1's retire step failed.
  await prisma.teamNote.updateMany({
    where: { body: { startsWith: "QA urgent note" }, active: true },
    data: { active: false, deactivatedAt: new Date() },
  });
  await prisma.$disconnect();
});

test("§1 team note banners for everyone until acknowledged", async ({
  page,
}) => {
  const body = `QA urgent note ${STAMP} — toner to Kennedy today`;

  // Dispatcher posts the note.
  await signInAs(page, PERSONA.DISPATCHER);
  await page.goto("/team-notes");
  await page.locator('input[name="body"]').fill(body);
  await page.getByRole("button", { name: "Post note" }).click();
  await expect(page.getByText(/Note posted/i)).toBeVisible({
    timeout: 15_000,
  });

  // A technician sees the banner anywhere in the app…
  await signInAs(page, PERSONA.TECHNICIAN);
  await page.goto("/tickets");
  const banner = page.getByTestId("team-note-banner");
  await expect(banner).toContainText(body, { timeout: 15_000 });

  // …acknowledges it, and it's gone for them. The ack redirects
  // with an ok param (toast); a hard reload then proves the server
  // no longer renders the note for this user.
  await banner
    .getByTestId("team-note-item")
    .filter({ hasText: body })
    .getByRole("button", { name: /acknowledge/i })
    .click();
  await page.waitForURL(/ok=/, { timeout: 15_000 });
  await page.reload();
  // The note may have been the only one — the banner unmounts
  // entirely — so assert on the text, not the container.
  await expect(page.getByText(body)).toHaveCount(0, { timeout: 15_000 });

  // The manager view records exactly who signed off.
  await signInAs(page, PERSONA.DISPATCHER);
  await page.goto("/team-notes");
  const row = page.locator('[data-testid="team-note-row"]', {
    hasText: body,
  });
  await expect(row).toContainText("Tess", { timeout: 15_000 });

  // Retire it so it doesn't pollute later specs.
  page.once("dialog", (d) => void d.accept());
  await row.getByRole("button", { name: "Retire" }).click();
  await expect(page.getByText(/Note retired/i)).toBeVisible({
    timeout: 15_000,
  });
});

test("§2 reporting a delay chips the stop and emails the SPOC", async ({
  page,
}) => {
  // Enable the seeded stop_delayed rule so the dispatch produces an
  // EmailLog row.
  await prisma.emailRule.updateMany({
    where: { event: "stop_delayed" },
    data: { enabled: true },
  });
  const route = await prisma.route.findFirstOrThrow({
    where: { vehicleRef: "TEST-VAN-1" },
    include: {
      stops: {
        orderBy: { sequence: "asc" },
        take: 1,
        include: { job: { select: { ticketLinks: true } } },
      },
    },
  });
  const stop = route.stops[0]!;
  // Make sure the stop is workable (other specs complete it).
  await prisma.routeStop.update({
    where: { id: stop.id },
    data: {
      status: "SCHEDULED",
      delayedAt: null,
      delayReason: null,
      delayMinutes: null,
      delayNote: null,
    },
  });
  await prisma.route.update({
    where: { id: route.id },
    data: { status: "PLANNED" },
  });

  await signInAs(page, PERSONA.DISPATCHER);
  await page.goto(`/scheduling/routes/${route.id}`);

  const panel = page.getByTestId("report-delay").first();
  await panel.locator("summary").click();
  await panel.locator('select[name="reason"]').selectOption("WEATHER");
  await panel.locator('input[name="minutes"]').fill("45");
  await panel.locator('input[name="note"]').fill("Snow on the Deegan");
  await panel
    .getByRole("button", { name: /record delay & notify school/i })
    .click();

  await expect(page.getByText(/Delay recorded — Weather/i)).toBeVisible({
    timeout: 15_000,
  });
  // Amber chip on the stop summary.
  await expect(
    page.locator(`[data-stop-id="${stop.id}"]`).getByText(/Delayed — Weather/i),
  ).toBeVisible();

  // Email went through the chokepoint for the stop's ticket.
  const ticketId = stop.job.ticketLinks[0]?.ticketId;
  expect(ticketId).toBeTruthy();
  // EmailLog carries no event column — identify the dispatch via
  // the stop_delayed template.
  const log = await prisma.emailLog.findFirst({
    where: {
      ticketId: ticketId!,
      template: { key: "stop_delayed" },
    },
    orderBy: { createdAt: "desc" },
  });
  expect(log).not.toBeNull();
  expect(log!.subject.toLowerCase()).toContain("running late");

  await prisma.emailRule.updateMany({
    where: { event: "stop_delayed" },
    data: { enabled: false },
  });
});

test("§3 expense lifecycle: submit → review → CSV", async ({ page }) => {
  // Tech submits.
  await signInAs(page, PERSONA.TECHNICIAN);
  await page.goto("/me/expenses");
  await page.locator('input[name="amount"]').fill("2.90");
  await page
    .locator('input[name="description"]')
    .fill(`Bx12 bus ${STAMP}`);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText(/Expense submitted/i)).toBeVisible({
    timeout: 15_000,
  });
  const myRow = page
    .locator('[data-testid="expense-row"]', { hasText: `Bx12 bus ${STAMP}` })
    .first();
  await expect(myRow).toContainText("$2.90");
  await expect(myRow).toContainText(/submitted/i);

  // Ops approves on the weekly review page.
  await signInAs(page, PERSONA.OPS_MANAGER);
  await page.goto("/admin/expenses");
  const section = page
    .locator('[data-testid="expense-tech-section"]', { hasText: "Tess" })
    .first();
  const line = section.locator("li", { hasText: `Bx12 bus ${STAMP}` });
  await line.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Expense approved/i)).toBeVisible({
    timeout: 15_000,
  });

  // CSV export covers the same week.
  const res = await page.request.get("/api/exports/expenses");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toContain(`Bx12 bus ${STAMP}`);
});

test("§4 generate PO from an approved quote → printable sheet", async ({
  page,
}) => {
  // Stage an approved quote on a fixture ticket.
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { incidentNumber: "INC90990016" },
    select: { id: true },
  });
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { state: "QUOTE_APPROVED", stateEnteredAt: new Date() },
  });
  // Clean re-runs: drop any quote/PO left by a previous pass.
  const oldQuotes = await prisma.quote.findMany({
    where: { ticketId: ticket.id },
    select: { id: true },
  });
  if (oldQuotes.length > 0) {
    await prisma.purchaseOrder.deleteMany({
      where: { quoteId: { in: oldQuotes.map((q) => q.id) } },
    });
    await prisma.quote.deleteMany({ where: { ticketId: ticket.id } });
  }
  const quote = await prisma.quote.create({
    data: {
      ticketId: ticket.id,
      status: "APPROVED",
      amountCents: 12_345,
      respondedAt: new Date(),
    },
  });

  await signInAs(page, PERSONA.OPS_MANAGER);
  await page.goto(`/tickets/${ticket.id}`);
  await page
    .getByRole("button", { name: /generate po for customer/i })
    .click();

  // Lands on the printable PO sheet with a minted number.
  await page.waitForURL(new RegExp(`/quotes/${quote.id}/po`), {
    timeout: 20_000,
  });
  const sheet = page.getByTestId("po-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/PO-\d{4}-\d{4}/);
  await expect(sheet).toContainText("$123.45");

  // Ticket page now offers Print PO instead of Generate.
  await page.goto(`/tickets/${ticket.id}`);
  await expect(page.getByRole("link", { name: "Print PO" })).toBeVisible();
});

test("§5 location sorting works on tickets and schools", async ({ page }) => {
  await signInAs(page, PERSONA.ADMIN);

  await page.goto("/tickets?sort=schoolName&dir=asc");
  const schools = await page
    .locator("tbody tr td:nth-child(7)")
    .allInnerTexts();
  const nonEmpty = schools.filter(Boolean);
  expect(nonEmpty.length).toBeGreaterThan(1);
  const sorted = [...nonEmpty].sort((a, b) => a.localeCompare(b));
  expect(nonEmpty).toEqual(sorted);

  await page.goto("/admin/schools?sort=code&dir=desc");
  await expect(page.getByRole("link", { name: /DBN code ↓/ })).toBeVisible();
});

test("§6 tech sees upcoming routes on /me/schedule", async ({ page }) => {
  // Reset TEST-VAN-1 to an upcoming, workable state for Dante.
  const route = await prisma.route.findFirstOrThrow({
    where: { vehicleRef: "TEST-VAN-1" },
  });
  await prisma.route.update({
    where: { id: route.id },
    data: {
      status: "PLANNED",
      date: new Date(new Date().toISOString().slice(0, 10)),
    },
  });

  await signInAs(page, PERSONA.DRIVER);
  await page.goto("/me/schedule");
  const row = page.getByTestId("my-route-row").first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(/stop/);
  await row.getByRole("link", { name: "Open route" }).click();
  await page.waitForURL(/\/scheduling\/routes\//, { timeout: 15_000 });
});

test("§7 seeded rules + report builders are wired", async () => {
  // seed-defaults created disabled starter rules for the new events.
  for (const event of [
    "pickup_scheduled",
    "delivery_scheduled",
    "stop_delayed",
    "report_operations",
    "report_finance",
  ] as const) {
    const rule = await prisma.emailRule.findFirst({ where: { event } });
    expect(rule, `seeded rule for ${event}`).not.toBeNull();
  }
  // The legacy ticket_created seed carried an invalid recipient kind
  // ("school_spoc"); the repair pass must have rewritten it.
  const tc = await prisma.emailRule.findFirst({
    where: { event: "ticket_created" },
  });
  expect(JSON.stringify(tc?.recipients ?? {})).not.toContain("school_spoc");
});
