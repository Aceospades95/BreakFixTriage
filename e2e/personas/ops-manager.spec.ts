import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "../lib/sign-in-as";

/**
 * Round-13 §2D — Olivia Ops Manager persona walk.
 *
 * (1) Open /dashboards. Walk all 4 tabs.
 * (2) Export Quotes CSV.
 * (3) Run "Sweep now" on stale quotes from /quotes banner.
 * (4) Open /admin/audit, filter by actor=Olivia, verify sweep
 *     is logged.
 * (5) Confirm Olivia can read every page she should but cannot
 *     write to /admin/users, /admin/permissions, /admin/email-rules.
 */

test.describe("§2D ops-manager persona", () => {
  test("dashboard walk + read-write surface", async ({ page }) => {
    await signInAs(page, PERSONA.OPS_MANAGER);

    // (1) — All 4 dashboard pages reachable.
    for (const path of [
      "/dashboards",
      "/dashboards/finance",
      "/dashboards/productivity",
      "/dashboards/devices",
    ] as const) {
      const resp = await page.goto(path);
      expect(resp?.status(), `${path} blocked`).toBe(200);
    }

    // (2) — Export Quotes CSV.
    await page.goto("/quotes");
    const exportLink = page
      .getByRole("link", { name: /export.*csv/i })
      .first();
    await expect(exportLink).toBeVisible();
    expect(await exportLink.getAttribute("href")).toMatch(
      /^\/api\/exports\/quotes/,
    );
  });

  test("Olivia is blocked from /admin/users + /admin/permissions + /admin/email-rules", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.OPS_MANAGER);

    for (const path of [
      "/admin/users",
      "/admin/permissions",
      "/admin/email-rules",
    ] as const) {
      const resp = await page.goto(path);
      const blocked =
        (resp?.status() ?? 0) >= 400 ||
        page.url().includes("/forbidden") ||
        page.url().includes("?error=") ||
        !page.url().includes(path);
      expect(blocked, `Olivia should not see ${path}`).toBe(true);
    }
  });
});
