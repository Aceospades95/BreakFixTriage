import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-22 — email rules built out + leadership lists + delay
 * cascade.
 *
 *  §1 rule editor: add a rule, edit recipients (incl. a leadership
 *     list), enable it; the enable guard blocks empty 'To'.
 *  §2 leadership distribution lists save on /admin/settings and
 *     resolve through a rule.
 *  §3 reporting a delay with "notify later stops" emails the
 *     downstream SPOC via the dedicated template.
 */

const prisma = new PrismaClient();
const STAMP = Date.now();

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  // Leave the leadership lists clean so other runs aren't surprised.
  await prisma.appSetting.deleteMany({
    where: {
      key: {
        in: [
          "email.districtLeadershipEmails",
          "email.internalLeadershipEmails",
          "email.primeLeadershipEmails",
        ],
      },
    },
  });
  await prisma.$disconnect();
});

test("§1 admin builds out a rule: add → recipients → enable", async ({
  page,
}) => {
  // Use a benign event with no fixture side effects.
  await prisma.emailRule.deleteMany({ where: { event: "ticket_closed" } });

  await signInAs(page, PERSONA.ADMIN);
  await page.goto("/admin/email-rules");

  // Add a rule for Ticket closed.
  await page
    .getByTestId("add-rule-form")
    .locator('select[name="event"]')
    .selectOption("ticket_closed");
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(page.getByText(/Rule added \(disabled\)/i).first()).toBeVisible({
    timeout: 15_000,
  });

  const row = page.locator('[data-testid="email-rule-row"][data-rule-event="ticket_closed"]');
  await expect(row).toBeVisible();
  // New rule has no recipients → "Enable" must be refused.
  await row.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(
    page.getByText(/Add at least one 'To' recipient before enabling/i).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Add a recipient (district leadership) and save.
  const row2 = page.locator('[data-testid="email-rule-row"][data-rule-event="ticket_closed"]');
  await row2.getByText("Edit recipients").click();
  const editor = row2.getByTestId("recipient-editor");
  await editor.getByRole("button", { name: "+ Add recipient" }).click();
  await editor
    .locator('select[aria-label="Recipient kind"]')
    .last()
    .selectOption("district_leadership");
  await editor.getByRole("button", { name: "Save recipients" }).click();
  await expect(page.getByText(/Recipients saved/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // Now enabling works.
  const row3 = page.locator('[data-testid="email-rule-row"][data-rule-event="ticket_closed"]');
  await row3.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByText(/Rule enabled/i).first()).toBeVisible({
    timeout: 15_000,
  });

  const rule = await prisma.emailRule.findFirst({
    where: { event: "ticket_closed" },
  });
  expect(rule?.enabled).toBe(true);
  expect(JSON.stringify(rule?.recipients)).toContain("district_leadership");

  // Cleanup.
  await prisma.emailRule.deleteMany({ where: { event: "ticket_closed" } });
});

test("§2 leadership lists save and resolve", async ({ page }) => {
  const addr = `prime-${STAMP}@leadership.test`;
  await signInAs(page, PERSONA.ADMIN);
  await page.goto("/admin/settings");
  await page
    .locator('textarea[name="primeLeadershipEmails"]')
    .fill(addr);
  await page.getByRole("button", { name: "Save settings" }).click();
  // ToastHost strips the ?ok param after showing it, so assert the
  // persisted value rather than the URL.
  await expect
    .poll(
      async () =>
        (
          await prisma.appSetting.findUnique({
            where: { key: "email.primeLeadershipEmails" },
          })
        )?.value ?? "",
      { timeout: 15_000 },
    )
    .toContain(addr);

  // The seeded report_finance rule targets prime_leadership — enable
  // it and run the REAL weekly-report script (the cron entrypoint),
  // then confirm the leadership address resolved on the send.
  await prisma.emailRule.updateMany({
    where: { event: "report_finance" },
    data: { enabled: true },
  });

  execFileSync(
    "npx",
    ["tsx", "scripts/send-scheduled-reports.ts", "--period=weekly"],
    {
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql://breakfix:breakfix@localhost:5432/breakfix_e2e?schema=public",
      },
      stdio: "pipe",
    },
  );

  const log = await prisma.emailLog.findFirst({
    where: { template: { key: "report_finance" } },
    orderBy: { createdAt: "desc" },
  });
  expect(log).not.toBeNull();
  expect(log!.to).toContain(addr.toLowerCase());

  await prisma.emailRule.updateMany({
    where: { event: "report_finance" },
    data: { enabled: false },
  });
});

test("§3 delay cascade emails the downstream SPOC", async ({ page }) => {
  await prisma.emailRule.updateMany({
    where: { event: { in: ["stop_delayed", "stop_delayed_downstream"] } },
    data: { enabled: true },
  });

  const route = await prisma.route.findFirstOrThrow({
    where: { vehicleRef: "TEST-VAN-1" },
    include: {
      stops: {
        orderBy: { sequence: "asc" },
        include: { job: { select: { ticketLinks: true } } },
      },
    },
  });
  // Need at least 2 active stops; reset them workable.
  await prisma.routeStop.updateMany({
    where: { routeId: route.id },
    data: {
      status: "SCHEDULED",
      delayedAt: null,
      delayReason: null,
      delayMinutes: null,
      delayNote: null,
      arrivalEstimate: new Date(),
    },
  });
  await prisma.route.update({
    where: { id: route.id },
    data: { status: "PLANNED" },
  });
  test.skip(route.stops.length < 2, "fixture route needs ≥2 stops");
  const laterStop = route.stops[1]!;
  const laterTicketId = laterStop.job.ticketLinks[0]?.ticketId;
  expect(laterTicketId).toBeTruthy();

  await signInAs(page, PERSONA.DISPATCHER);
  await page.goto(`/scheduling/routes/${route.id}`);

  const panel = page.getByTestId("report-delay").first();
  await panel.locator("summary").click();
  await panel.locator('select[name="reason"]').selectOption("CONSTRUCTION");
  await panel.locator('input[name="minutes"]').fill("30");
  await panel.locator('input[name="notifyDownstream"]').check();
  await panel
    .getByRole("button", { name: /record delay & notify school/i })
    .click();

  await expect(page.getByText(/Later stops on the route were updated/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // The downstream ticket got the dedicated template.
  const log = await prisma.emailLog.findFirst({
    where: {
      ticketId: laterTicketId!,
      template: { key: "stop_delayed_downstream" },
    },
    orderBy: { createdAt: "desc" },
  });
  expect(log).not.toBeNull();
  expect(log!.subject.toLowerCase()).toContain("may run late");

  await prisma.emailRule.updateMany({
    where: { event: { in: ["stop_delayed", "stop_delayed_downstream"] } },
    data: { enabled: false },
  });
});
