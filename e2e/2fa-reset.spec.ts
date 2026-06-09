import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-12 §1D — Reset 2FA admin button gating + audit row.
 *
 * Scenario:
 *   1. Programmatically enroll Tess in 2FA (set totpSecret +
 *      totpEnabledAt directly via Prisma, bypassing the user
 *      flow which would require a real authenticator app).
 *   2. Sign in as Alex Admin.
 *   3. Visit /admin/users/{tess-id} and assert the
 *      TWO-FACTOR AUTHENTICATION panel reads "Enrolled · {ISO}"
 *      with the Reset 2FA button visible.
 *   4. Click Reset 2FA and accept the native confirm dialog.
 *   5. Assert the panel reverts to "Not enrolled".
 *   6. Assert the totpSecret column is null in the DB.
 *   7. Assert an audit row was written with action="2fa:admin-reset"
 *      (per the existing src/server/actions/2fa.ts code) — the
 *      brief asked for action="admin_reset_2fa" but we kept the
 *      existing audit name to avoid orphaning historical rows.
 *      Documented in docs/round-12-assumptions.md.
 *
 * Requires DATABASE_URL + the test fixtures from §1E
 * (`npm run db:seed:test`). Skipped if Playwright runtime is
 * unavailable.
 */

const prisma = new PrismaClient();

test.describe("§1D Reset 2FA gating", () => {
  let tessId: string;
  let alexId: string;

  test.beforeAll(async () => {
    const tess = await prisma.user.findUnique({
      where: { email: "tess@example.test" },
      select: { id: true },
    });
    const alex = await prisma.user.findUnique({
      where: { email: "alex@example.test" },
      select: { id: true },
    });
    if (!tess || !alex) {
      test.skip(
        true,
        "Persona fixtures missing — run npm run db:seed:test first.",
      );
      return;
    }
    tessId = tess.id;
    alexId = alex.id;

    // Enroll Tess in 2FA directly. The TOTP secret is gibberish for
    // testing — the spec doesn't try to verify a code; it only
    // tests the admin reset path.
    await prisma.user.update({
      where: { id: tessId },
      data: {
        totpSecret: "JBSWY3DPEHPK3PXP", // base32 — valid shape
        totpEnabledAt: new Date(),
      },
    });
  });

  test.afterAll(async () => {
    if (tessId) {
      // Clean up — leave Tess in the un-enrolled state.
      await prisma.user.update({
        where: { id: tessId },
        data: { totpSecret: null, totpEnabledAt: null },
      });
    }
    await prisma.$disconnect();
  });

  test("enrolled panel renders + Reset 2FA writes audit + reverts state", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.ADMIN);

    await page.goto(`/admin/users/${tessId}`);

    // Panel reads "Enrolled · {ISO timestamp}".
    const panel = page.getByTestId("two-factor-enrolled-panel");
    await expect(panel).toBeVisible();
    const line = page.getByTestId("two-factor-enrolled-line");
    await expect(line).toContainText("Enrolled");
    await expect(line).toContainText(new Date().getUTCFullYear().toString());

    // Reset 2FA button is present.
    const resetBtn = panel.getByRole("button", { name: /reset 2fa/i });
    await expect(resetBtn).toBeVisible();

    // Click — native confirm — accept.
    page.once("dialog", (d) => d.accept());
    await resetBtn.click();

    // Panel reverts to "Not enrolled".
    await page.waitForURL(/\/admin\/users\//);
    await expect(page.getByText(/Not enrolled/i)).toBeVisible();

    // DB: totpSecret + totpEnabledAt are now null.
    const after = await prisma.user.findUnique({
      where: { id: tessId },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    expect(after?.totpSecret).toBeNull();
    expect(after?.totpEnabledAt).toBeNull();

    // Audit row was written.
    const auditRow = await prisma.auditLog.findFirst({
      where: {
        actorUserId: alexId,
        entityType: "User",
        entityId: tessId,
        action: "2fa:admin-reset",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow).not.toBeNull();
  });
});

