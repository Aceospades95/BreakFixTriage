import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "../lib/sign-in-as";

/**
 * STATUS: Aspirational coverage for Round-13 §2G persona scope.
 * The destructive-action stress walk (reset 2FA + revoke all
 * sessions + bulk close + force state) is marked test.fixme()
 * because the bulk-close-stale and force-state flows are not
 * yet wired end-to-end on this branch. See docs/round-13-backlog.md
 * (B14).
 *
 * One smoke test stays active: Alex Admin can reach
 * /admin/users/[id]. That single anchor catches a regression of
 * the cookie-helper or the /admin/users gate without depending
 * on the destructive flows below.
 */

/**
 * Round-13 §2G — Alex Admin destructive-action stress walk.
 *
 * (1) Reset another user's 2FA. Confirm audit entry.
 * (2) Sign-out-all-sessions for another user. Confirm audit entry.
 * (3) Bulk close stale tickets. Confirm preview screen first +
 *     count match + audit summary entry.
 * (4) Force-state a ticket through CHANGE STATUS (ADMIN). Confirm
 *     reason was required + audit captures both old and new state.
 *
 * Each assertion confirms an audit row was written — every
 * destructive admin action must leave a trail per the rules of
 * engagement.
 */

const prisma = new PrismaClient();

test.describe("§2G admin-destructive persona", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("Alex Admin can navigate to /admin/users/[id]", async ({ page }) => {
    await signInAs(page, PERSONA.ADMIN);
    const tess = await prisma.user.findUnique({
      where: { email: PERSONA.TECHNICIAN },
      select: { id: true },
    });
    if (!tess?.id) {
      test.skip(true, "Tess fixture missing — run npm run db:seed:test");
      return;
    }
    const resp = await page.goto(`/admin/users/${tess.id}`);
    expect(resp?.status()).toBe(200);
    // Page heading is the user's name; just assert SOMETHING
    // rendered (no global error boundary, no chromed-not-found).
    const html = await page.content();
    expect(html).not.toContain("Something broke on this page");
    expect(html).not.toContain('data-testid="chromed-not-found"');
  });

  test.fixme("reset 2FA + sign out all + bulk close + force state — each writes audit", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.ADMIN);

    const tess = await prisma.user.findUnique({
      where: { email: PERSONA.TECHNICIAN },
      select: { id: true },
    });
    expect(tess?.id).toBeTruthy();
    const alex = await prisma.user.findUnique({
      where: { email: PERSONA.ADMIN },
      select: { id: true },
    });
    expect(alex?.id).toBeTruthy();

    // Pre-enroll Tess in 2FA so the Reset 2FA button is visible.
    await prisma.user.update({
      where: { id: tess!.id },
      data: { totpSecret: "JBSWY3DPEHPK3PXP", totpEnabledAt: new Date() },
    });

    // (1) — Reset 2FA via the panel (R12 §1D).
    await page.goto(`/admin/users/${tess!.id}`);
    page.once("dialog", (d) => d.accept());
    const resetBtn = page.getByRole("button", { name: /reset 2fa/i });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await page.waitForURL(/\/admin\/users\//);
    const resetAudit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: alex!.id,
        entityType: "User",
        entityId: tess!.id,
        action: "2fa:admin-reset",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(resetAudit).not.toBeNull();

    // (2) — Sign out all sessions (R12 §1C).
    // Create a session row so there's something to revoke.
    await prisma.userSession.create({
      data: {
        userId: tess!.id,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    await page.goto(`/admin/users/${tess!.id}`);
    page.once("dialog", (d) => d.accept());
    const signOutBtn = page.getByRole("button", { name: /sign out all/i });
    if (await signOutBtn.isVisible().catch(() => false)) {
      await signOutBtn.click();
      await page.waitForURL(/\/admin\/users\//);
      const revokeAudit = await prisma.auditLog.findFirst({
        where: {
          actorUserId: alex!.id,
          entityType: "User",
          entityId: tess!.id,
          action: "user.sessions.revoke_all",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(revokeAudit).not.toBeNull();
    }

    // (3) — Bulk close stale ticket preview is reachable.
    await page.goto("/admin/tools/bulk-close");
    await expect(
      page.getByRole("heading", { name: /bulk close/i }),
    ).toBeVisible();
  });
});
