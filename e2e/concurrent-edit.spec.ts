import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-2 QA audit — concurrent-edit protection.
 *
 * The audit's repro: open the same ticket in two sessions, save a
 * priority change in each without refreshing between them. Before the
 * fix the second save silently won (last-write-wins) and the first
 * session's tab kept showing its own stale value until a manual
 * reload.
 *
 * Now: the second (stale) save is REJECTED with an explanatory toast
 * and an `update:stale-rejected` audit row, and an idle third session
 * refreshes itself via the tickets.changed SSE stream.
 */

const prisma = new PrismaClient();
// Uppercase — incident numbers are canonically upper-case and the
// /tickets/[id] INC-URL redirect resolves them case-sensitively.
const STAMP = Date.now().toString(36).toUpperCase();

test.afterAll(async () => {
  await prisma.ticket.deleteMany({
    where: { incidentNumber: { startsWith: `INCCONC${STAMP}` } },
  });
  await prisma.$disconnect();
});

test("stale save is rejected, audited, and idle tabs live-refresh", async ({
  browser,
}) => {
  const school = await prisma.school.findFirstOrThrow();
  const ticket = await prisma.ticket.create({
    data: {
      incidentNumber: `INCCONC${STAMP}`,
      shortDescription: "concurrency fixture",
      state: "TRIAGE",
      priority: "NORMAL",
      schoolId: school.id,
      reportedAt: new Date(),
    },
  });

  // Session A (admin) and session B (ops manager) both load the page.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  // B's SSE stream is blocked so the tab CANNOT live-refresh — the
  // deterministic worst case (network blip / background tab) where
  // the server-side stale check is the only protection left.
  await ctxB.route("**/api/events", (r) => r.abort());
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await signInAs(pageA, PERSONA.ADMIN);
  await signInAs(pageB, PERSONA.OPS_MANAGER);
  await pageA.goto(`/tickets/${ticket.id}`);
  await pageB.goto(`/tickets/${ticket.id}`);
  const formA = pageA
    .locator('form:has(select[name="priority"])')
    .first();
  const formB = pageB
    .locator('form:has(select[name="priority"])')
    .first();
  await formA.locator('select[name="priority"]').waitFor({ state: "visible" });
  await formB.locator('select[name="priority"]').waitFor({ state: "visible" });

  // A saves High — succeeds.
  await formA.locator('select[name="priority"]').selectOption("HIGH");
  await formA.getByRole("button", { name: "save" }).click();
  await expect
    .poll(
      async () =>
        (await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .priority,
      { timeout: 15_000 },
    )
    .toBe("HIGH");

  // B, still on the pre-A page, saves Urgent — must be rejected.
  // (B's tab may live-refresh from A's save; the stale stamp is baked
  // into the form B loaded, so the submit still carries it — but grab
  // the form reference fresh in case of re-render.)
  await formB.locator('select[name="priority"]').selectOption("URGENT");
  await formB.getByRole("button", { name: "save" }).click();
  await pageB.waitForURL(/error=/, { timeout: 15_000 });
  const url = decodeURIComponent(pageB.url());
  expect(url).toContain("changed while you had it open");

  // The canonical value is still A's — no silent clobber.
  const final = await prisma.ticket.findUniqueOrThrow({
    where: { id: ticket.id },
  });
  expect(final.priority).toBe("HIGH");

  // The conflict left an audit trace.
  const audit = await prisma.auditLog.findFirst({
    where: {
      entityType: "Ticket",
      entityId: ticket.id,
      action: "update:stale-rejected",
    },
  });
  expect(audit).not.toBeNull();

  await ctxA.close();
  await ctxB.close();
});

test("an idle viewer picks up another session's save via SSE", async ({
  browser,
}) => {
  const school = await prisma.school.findFirstOrThrow();
  const ticket = await prisma.ticket.create({
    data: {
      incidentNumber: `INCCONC${STAMP}-SSE`,
      shortDescription: "sse fixture",
      state: "TRIAGE",
      priority: "NORMAL",
      schoolId: school.id,
      reportedAt: new Date(),
    },
  });

  const viewerCtx = await browser.newContext();
  const editorCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  const editor = await editorCtx.newPage();
  await signInAs(viewer, PERSONA.READ_ONLY);
  await signInAs(editor, PERSONA.ADMIN);

  await viewer.goto(`/tickets/${ticket.id}`);
  // Read-only renders priority as plain text.
  await expect(viewer.getByText("Normal", { exact: true }).first()).toBeVisible();

  const form = editor.locator('form:has(select[name="priority"])').first();
  await editor.goto(`/tickets/${ticket.id}`);
  await form.locator('select[name="priority"]').selectOption("URGENT");
  await form.getByRole("button", { name: "save" }).click();

  // No reload on the viewer — the SSE-driven router.refresh should
  // bring the new value in.
  await expect(
    viewer.getByText("Urgent", { exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await viewerCtx.close();
  await editorCtx.close();
});
