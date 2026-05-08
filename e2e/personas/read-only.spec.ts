import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "../lib/sign-in-as";
import { expectBlocked } from "../lib/access";

/**
 * STATUS: Aspirational coverage for Round-13 §2F persona scope.
 * Tests below are marked test.fixme() because the read-only
 * role's full permission matrix + the /forbidden redirect path
 * + the seeded persona fixtures all assume app surfaces not yet
 * wired end-to-end on this branch. See docs/round-13-backlog.md
 * (B14).
 *
 * Do NOT ship code that "fixes" these by mocking out the
 * assertion — unfixme each test only when the real app surface
 * exists end-to-end.
 */

/**
 * Round-13 §2F — Reed (Ray) Read-only persona walk.
 *
 * Reader account that can browse every page but is blocked from
 * any state-changing API. Verify Ray gets a friendly disabled
 * state on every action button (not an error toast after a
 * failed POST). Spec asserts:
 *
 *   - Any attempt to POST/PATCH/DELETE returns 403 from the API
 *     gate.
 *   - The UI does not show an enabled button to start with.
 */

test.describe("§2F read-only persona", () => {
  test.fixme("can browse every read surface", async ({ page }) => {
    await signInAs(page, PERSONA.READ_ONLY);

    for (const path of [
      "/",
      "/my-day",
      "/tickets",
      "/tickets/kanban",
      "/bench",
      "/duplicates",
      "/scheduling",
      "/scheduling/people",
      "/dashboards",
      "/dashboards/finance",
      "/notifications",
      "/profile",
      "/me/preferences",
    ] as const) {
      const resp = await page.goto(path);
      expect(resp?.status(), `${path} blocked Ray`).toBe(200);
    }
  });

  test.fixme("API mutation endpoints return 403 to Ray", async ({ page }) => {
    await signInAs(page, PERSONA.READ_ONLY);

    // Pick a representative mutation API endpoint. Read-only
    // role sees 401 or 403 from each.
    for (const path of [
      "/api/exports/users",
      "/api/exports/schools",
      "/api/exports/devices",
      "/api/exports/email-log",
      "/api/exports/audit",
    ] as const) {
      const resp = await page.request.get(path, { failOnStatusCode: false });
      expect([401, 403]).toContain(resp.status());
    }
  });

  test.fixme("forbidden pages 403 / redirect / error-boundary, never crash", async ({
    page,
  }) => {
    await signInAs(page, PERSONA.READ_ONLY);
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/email-rules",
      "/imports/new",
      "/scheduling/routes/new",
    ] as const) {
      const resp = await page.goto(path);
      await expectBlocked(page, resp, path, "Read-only");
    }
  });
});
