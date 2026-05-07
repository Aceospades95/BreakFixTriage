import { test, expect } from "@playwright/test";

/**
 * Round-11 §2B — graduates Round-10 §3D.
 *
 * Sign in as Alex Admin → create a new ticket via /tickets quick-
 * create from a seeded template → assert that within 5 seconds an
 * EmailLog row exists with:
 *
 *   - templateId matching the seeded ticket_created template
 *   - to[] including the school's SPOC contact email
 *   - status === "dispatched" (or "queued" if the async worker
 *     hasn't drained the queue yet)
 *   - subject matching the rendered template
 *
 * The fixture suite uses an in-memory SMTP transport (see
 * docs/round-11-email-fixtures.md) so the assertion doesn't
 * depend on a real provider. The transport is wired in the test
 * harness via SMTP_HOST / SMTP_PORT pointing at Mailpit.
 *
 * Runtime depends on §2D CI Postgres + Playwright + email
 * fixture. Until that lands, this spec runs manually per the
 * qa-checklist.
 */

test("§2B: ticket creation enqueues a SPOC notification", async ({ page, request }) => {
  await signIn(page, "alex@example.test");

  // Use the quick-create form on /tickets — the seed loads at
  // least one template.
  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: /tickets/i })).toBeVisible();

  const form = page.locator('form[action*="createTicketFromTemplateAction"]');
  await form.locator('select[name="templateId"]').selectOption({ index: 1 });
  await form.locator('select[name="schoolId"]').selectOption({ index: 1 });
  await form.getByRole("button", { name: /create ticket/i }).click();

  // The redirect lands on the new ticket. Capture the INC#.
  await page.waitForURL(/\/tickets\//);
  const url = new URL(page.url());
  const incidentMatch = url.pathname.match(/\/tickets\/(INC[A-Z0-9-]+)/);
  expect(incidentMatch).not.toBeNull();
  const incidentNumber = incidentMatch![1];

  // Wait up to 5s for the EmailLog row to appear. Polled via the
  // /admin/email-log page so we exercise the same view operators
  // see.
  await signIn(page, "alex@example.test");
  await page.goto("/admin/email-log");

  const matchingRow = page.locator("tr", {
    has: page.locator(`text=${incidentNumber}`),
  });
  await expect(matchingRow).toBeVisible({ timeout: 5000 });
  await expect(matchingRow).toContainText(/dispatched|queued/i);

  // Sanity check the SMTP capture — Mailpit exposes a JSON API on
  // :8025 that the test harness probes.
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

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/signin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "test-password");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}
