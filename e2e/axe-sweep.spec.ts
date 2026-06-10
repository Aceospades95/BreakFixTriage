import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
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

/**
 * Round-16 (D5) — the operator-app sweep above never covered the
 * surfaces that render OUTSIDE the (app) chrome: the anonymous
 * school portal and the print sheets. Same zero-violation contract.
 *
 * The portal token is minted directly via Prisma (sha256 hex of the
 * plaintext, mirroring src/lib/portal/tokens.ts — e2e specs can't
 * resolve the "@/" alias to import the helper).
 */
const prisma = new PrismaClient();

test.describe("@axe portal + print sweep", () => {
  let portalPath: string;
  let ticketPrintPath: string;
  let routePrintPath: string;

  test.beforeAll(async () => {
    const school = await prisma.school.findUniqueOrThrow({
      where: { code: "TEST-101" },
      select: { id: true },
    });
    const plaintext = randomBytes(32).toString("base64url");
    await prisma.portalToken.create({
      data: {
        schoolId: school.id,
        token: createHash("sha256").update(plaintext).digest("hex"),
        tokenPrefix: plaintext.slice(0, 8),
        label: "axe-sweep fixture",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    portalPath = `/portal/${plaintext}`;
    ticketPrintPath = "/tickets/INC9990000/print";
    const route = await prisma.route.findFirstOrThrow({
      where: { vehicleRef: "TEST-VAN-1" },
      select: { id: true },
    });
    routePrintPath = `/scheduling/routes/${route.id}/print`;
  });

  test.afterAll(async () => {
    await prisma.portalToken.deleteMany({
      where: { label: "axe-sweep fixture" },
    });
    await prisma.$disconnect();
  });

  for (const theme of THEMES) {
    test(`portal page axe clean in ${theme} mode`, async ({
      page,
      context,
    }) => {
      // Anonymous on purpose — the portal is the one surface school
      // staff reach without an account.
      await context.addCookies([
        {
          name: "theme",
          value: theme,
          url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
        },
      ]);
      await page.goto(portalPath);
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
        `portal (${theme}) has axe violations:\n${summary}`,
      ).toEqual([]);
    });
  }

  for (const printPage of ["ticket", "route"] as const) {
    test(`${printPage} print sheet axe clean`, async ({ page }) => {
      await signInAs(page, PERSONA.ADMIN);
      const path =
        printPage === "ticket" ? ticketPrintPath : routePrintPath;
      await page.goto(path);
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
        `${path} has axe violations:\n${summary}`,
      ).toEqual([]);
    });
  }
});
