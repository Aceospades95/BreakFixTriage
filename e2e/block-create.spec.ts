import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-11 §2A — graduates Round-10 §2C. Re-activated in Round-14:
 * the people grid now carries the data-testid hooks
 * (people-row / people-add-block-form / block-segment) and the
 * spec uses the JWT cookie helper.
 *
 * Sign in as Olivia Ops (ops manager), open /scheduling/people,
 * expand "+ Add" on Tess Technician's row, save a PTO block, and
 * assert:
 *
 *   1. The row's timeline shows the PTO block segment.
 *   2. A `staff.schedule.created` audit row exists with Olivia as
 *      the actor (asserted via Prisma — the /admin/audit category
 *      chips don't map StaffSchedule, so the DB is the contract).
 */

const TECH_NAME = "Tess Technician";

const prisma = new PrismaClient();

test.describe("§2A ops manager creates a PTO block", () => {
  let tessId: string;
  let oliviaId: string;

  test.beforeAll(async () => {
    const [tess, olivia] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: PERSONA.TECHNICIAN },
        select: { id: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: PERSONA.OPS_MANAGER },
        select: { id: true },
      }),
    ]);
    tessId = tess.id;
    oliviaId = olivia.id;
    // Clean any block left behind by a previous run so the
    // block-segment assertion can't pass spuriously.
    await prisma.staffSchedule.deleteMany({
      where: { userId: tessId, kind: "PTO" },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("PTO block renders on the row + audit row written", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.OPS_MANAGER);

    await page.goto("/scheduling/people");
    await expect(
      page.getByRole("heading", { name: /people/i }),
    ).toBeVisible();

    // Both the dev seed (tech@breakfix.local) and the test seed
    // (tess@example.test) name their technician "Tess Technician",
    // so a dev DB with both seeds shows two equivalent rows — take
    // the first; the audit assertion below is row-independent.
    const techRow = page
      .locator(`[data-testid="people-row"]:has-text("${TECH_NAME}")`)
      .first();
    await expect(techRow).toBeVisible();

    await techRow.getByText("+ Add").click();

    const form = techRow.locator(
      'form[data-testid="people-add-block-form"]',
    );
    await expect(form).toBeVisible();

    await form.locator('select[name="kind"]').selectOption("PTO");
    await form.locator('input[name="startMinute"]').fill("09:00");
    await form.locator('input[name="endMinute"]').fill("17:00");
    await form.locator('input[name="note"]').fill("R11 test block");

    await form.getByRole("button", { name: /^save$/i }).click();

    await expect(page).toHaveURL(/\/scheduling\/people/);
    await expect(
      techRow.locator('[data-testid="block-segment"][data-kind="PTO"]'),
    ).toBeVisible();

    // Audit contract — the action writes a staff.schedule.created
    // row attributed to the ops manager.
    const auditRow = await prisma.auditLog.findFirst({
      where: {
        action: "staff.schedule.created",
        actorUserId: oliviaId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow, "staff.schedule.created audit row missing").not.toBeNull();
  });
});
