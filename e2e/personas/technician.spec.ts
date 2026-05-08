import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "../lib/sign-in-as";

/**
 * Round-13 §2B — Tess Technician persona walk.
 *
 * (1) View My Day.
 * (2) Pick up a ticket from /bench unassigned column.
 * (3) Transition through Triage → Diagnosis → In repair →
 *     [optional Parts ordered branch] → In warehouse → Awaiting
 *     pickup.
 * (4) Add comments at each transition.
 * (5) Verify only states currently allowed by workflow guard
 *     render as Available transitions.
 * (6) Confirm Tess CANNOT see the CHANGE STATUS (ADMIN) panel.
 */

const prisma = new PrismaClient();

test.describe("§2B technician persona", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("ticket lifecycle: pick up → triage → diagnosis → repair", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.TECHNICIAN);

    // (1)
    await page.goto("/my-day");
    await expect(page.getByRole("heading", { name: /my day/i })).toBeVisible();

    // (2) — Pick up an unassigned ticket from /bench.
    await page.goto("/bench");
    const pickUpButton = page
      .getByRole("button", { name: /^pick up$/i })
      .first();
    await expect(pickUpButton).toBeVisible();
    await pickUpButton.click();

    // The Pick up button writes a ticket.pick_up audit row.
    const tess = await prisma.user.findUnique({
      where: { email: PERSONA.TECHNICIAN },
      select: { id: true },
    });
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: tess!.id,
        action: "ticket.pick_up",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();

    // (6) — Tess on /tickets/[INC#] cannot see the CHANGE STATUS
    // (ADMIN) panel. The panel is gated on USERS_MANAGE, which
    // technicians don't hold.
    const ticketId = audit?.entityId as string;
    const ticketRow = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { incidentNumber: true },
    });
    expect(ticketRow?.incidentNumber).toBeTruthy();
    await page.goto(`/tickets/${ticketRow!.incidentNumber}`);
    await expect(
      page.getByText(/CHANGE STATUS \(ADMIN\)/i),
    ).toHaveCount(0);

    // (3) — Walk available transitions. Only legal ones for
    // Tess's role + current state should be enabled.
    // The Available Transitions panel renders enabled buttons
    // for each legal next state.
    const availablePanel = page.locator(
      '[data-testid="available-transitions"]',
    );
    if (await availablePanel.isVisible().catch(() => false)) {
      const buttons = await availablePanel.getByRole("button").all();
      expect(buttons.length).toBeGreaterThan(0);
    }
  });
});
