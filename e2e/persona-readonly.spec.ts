import { test, expect } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";
import { expectBlocked } from "./lib/access";

/**
 * Round-11 §2E — Ray ReadOnly daily workflow.
 *
 * Companion to §2C `e2e/readonly-role-403.spec.ts` which exhausts
 * the negative-space surface. This spec asserts the POSITIVE
 * read-only walk lands cleanly.
 */

test("§2E: Ray walks read-only surfaces", async ({ page }) => {
  await signInAs(page, PERSONA.READ_ONLY);

  for (const path of [
    "/tickets",
    "/tickets/kanban",
    "/imports",
    "/scheduling",
    "/quotes",
    "/dashboards",
    "/dashboards/finance",
  ] as const) {
    const resp = await page.goto(path);
    expect(resp?.status() ?? 0, `${path} blocked Ray ReadOnly`).toBeLessThan(400);
  }
});

test("§2E: Ray cannot reach /admin or /imports/new", async ({ page }) => {
  await signInAs(page, PERSONA.READ_ONLY);

  for (const path of ["/admin", "/imports/new"] as const) {
    const resp = await page.goto(path);
    await expectBlocked(page, resp, path, "Ray");
  }
});
