import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-15 — full axe-core accessibility sweep (graduates backlog
 * B9). The Round-13 contrast spec was a hand-rolled floor (body +
 * first sidebar link luminance); this walks the same 12 pages in
 * both themes with the real WCAG 2.0/2.1 A+AA rule set and asserts
 * zero violations per page.
 *
 * Allowlist policy: a rule lands in ALLOWLISTED_RULES only with a
 * comment explaining why the violation is intentional, and the
 * goal is an empty list. Do not add entries to make a red build
 * green — fix the markup instead.
 */

const PAGES = [
  "/",
  "/tickets",
  "/tickets/INC9990000",
  "/tickets/kanban",
  "/bench",
  "/scheduling",
  "/scheduling/people",
  "/scheduling/routes",
  "/dashboards",
  "/admin",
  "/admin/users",
  "/profile",
] as const;

const THEMES = ["light", "dark"] as const;

// rule id → reason. Keep empty if at all possible.
const ALLOWLISTED_RULES: Record<string, string> = {};

test.describe("@axe full accessibility sweep", () => {
  for (const theme of THEMES) {
    for (const path of PAGES) {
      test(`${path} axe clean in ${theme} mode`, async ({
        page,
        context,
      }) => {
        await signInAs(page, PERSONA.ADMIN);
        await context.addCookies([
          {
            name: "theme",
            value: theme,
            url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
          },
        ]);
        await page.goto(path);
        // Not networkidle — kanban and dashboards hold live
        // connections (SSE polling) that never go idle. The DOM
        // is what axe scans; "load" + a paint beat is sufficient.
        await page.waitForLoadState("load");
        await page.waitForTimeout(300);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        const violations = results.violations.filter(
          (v) => !(v.id in ALLOWLISTED_RULES),
        );
        const summary = violations
          .map(
            (v) =>
              `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s); first: ${v.nodes[0]?.target.join(" ")}`,
          )
          .join("\n");
        expect(
          violations,
          `${path} (${theme}) has axe violations:\n${summary}`,
        ).toEqual([]);
      });
    }
  }
});
