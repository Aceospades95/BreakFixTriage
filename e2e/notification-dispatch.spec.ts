import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

const prisma = new PrismaClient();

/**
 * Round-11 §2B — graduates Round-10 §3D. Re-activated in Round-15:
 * the B12 blocker closed via the in-memory provider work, and the
 * fixtures (TicketTemplate + SPOC contact + enabled GLOBAL
 * ticket_created rule) now ship in prisma/seed-test.ts.
 *
 * Sign in as Alex Admin → create a ticket via the /tickets
 * quick-create form → assert /admin/email-log shows the dispatch
 * row for the new incident with a non-failed status. When a
 * Mailpit container is present (CI integration profile) the
 * optional probe also asserts SMTP capture.
 */

test("§2B: ticket creation enqueues a SPOC notification", async ({
  page,
  request,
}) => {
  await signInAs(page, PERSONA.ADMIN);

  await page.goto("/tickets");
  await expect(
    page.getByRole("heading", { name: /tickets/i }),
  ).toBeVisible();

  // Resolve fixture ids via Prisma so the option picks are exact
  // regardless of display-label formatting.
  const template = await prisma.ticketTemplate.findUniqueOrThrow({
    where: { name: "Cracked screen (test)" },
    select: { id: true },
  });
  // TEST-101 carries the seeded SPOC contact; pick it explicitly so
  // recipient resolution always has someone to address.
  const school = await prisma.school.findUniqueOrThrow({
    where: { code: "TEST-101" },
    select: { id: true },
  });

  const form = page.getByTestId("quick-create-form");
  await expect(form).toBeVisible();
  await form.locator('select[name="templateId"]').selectOption(template.id);
  await form.locator('select[name="schoolId"]').selectOption(school.id);
  await form.getByRole("button", { name: /create ticket/i }).click();

  // The redirect lands on /tickets/<LOCAL#> — quick-create mints
  // LOCAL-prefixed numbers (outside the ServiceNow INC space).
  await page.waitForURL(/\/tickets\/LOCAL[A-Z0-9]+/, { timeout: 15_000 });
  const incidentNumber = new URL(page.url()).pathname.split("/").pop()!;
  expect(incidentNumber).toMatch(/^LOCAL/);

  // The dispatch row appears on the operator-facing email log.
  // The page renders entries as a list, not a table.
  await page.goto("/admin/email-log");
  const matchingRow = page.locator("li", { hasText: incidentNumber });
  await expect(matchingRow.first()).toBeVisible({ timeout: 10_000 });
  await expect(matchingRow.first()).toContainText(/queued|sent|dispatched/i);

  // Optional Mailpit probe — present only in the CI integration
  // profile; skipped silently elsewhere.
  const mailpit = await request
    .get("http://127.0.0.1:8025/api/v1/messages")
    .catch(() => null);
  if (mailpit && mailpit.ok()) {
    const body = await mailpit.json();
    const subjects = (
      (body as { messages?: { Subject?: string }[] }).messages ?? []
    ).map((m) => m.Subject ?? "");
    expect(subjects.some((s) => s.includes(incidentNumber))).toBe(true);
  }
});
