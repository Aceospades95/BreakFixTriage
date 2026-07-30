import { test, expect, type Page } from "@playwright/test";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Five-borough expansion — the borough filter and the per-borough
 * comparison report.
 *
 * The invariant these tests defend is not "does the page render" but
 * "does a number agree with the list it links to". Before this work
 * the dashboards emitted `?ageDays=gte:30` and `?state=CLOSED` links
 * that /tickets did not implement or did not bound, so a card read
 * 719 and the list one click away read 7,114. That class of bug is
 * invisible to a smoke test and obvious to anyone in a status
 * meeting, so it gets asserted numerically here.
 */

const FILTERED_SURFACES = [
  "/dashboards",
  "/dashboards/boroughs",
  "/dashboards/devices",
  "/dashboards/finance",
  "/dashboards/productivity",
  "/bench",
  "/bench/history",
  "/duplicates",
  "/scheduling",
];

const ERROR_MARKERS = [
  "Something broke on this page",
  "digest:",
  "Application error: a server-side exception has occurred",
];

/** Digits only — callers must target the element holding the value. */
const num = (s: string) => Number(s.replace(/[^0-9.]/g, "") || "0");

async function matchingTicketCount(page: Page): Promise<number> {
  const joined = (await page.locator("h1, p").allInnerTexts()).join(" ");
  const m = /([\d,]+)\s+matching ticket/.exec(joined);
  return m ? num(m[1]!) : -1;
}

test("every filtered surface survives a valid, absent, and bogus borough", async ({
  page,
}) => {
  await signInAs(page, PERSONA.ADMIN);
  for (const path of FILTERED_SURFACES) {
    // "Atlantis" is the stale-bookmark case: normalizeBorough must
    // fall back to all boroughs rather than render an empty report
    // that reads as "no work here".
    for (const qs of ["", "?borough=Bronx", "?borough=Atlantis"]) {
      const resp = await page.goto(`${path}${qs}`);
      expect(resp?.status(), `${path}${qs} status`).toBe(200);
      const html = await page.content();
      for (const marker of ERROR_MARKERS) {
        expect(html.includes(marker), `${path}${qs} rendered "${marker}"`).toBe(
          false,
        );
      }
    }
  }
});

test("borough rows always sum to the citywide total", async ({ page }) => {
  await signInAs(page, PERSONA.ADMIN);
  await page.goto("/dashboards/boroughs");
  const rows = page.getByTestId("borough-row");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);

  // Column 3 is Open. Districts with no borough set roll into an
  // explicit "Unassigned" row precisely so this holds — a silently
  // dropped bucket would make every column quietly wrong.
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += num(await rows.nth(i).locator("td").nth(3).innerText());
  }
  const footer = num(await page.locator("tfoot td").nth(3).innerText());
  expect(sum, "borough rows must reconcile to the footer total").toBe(footer);
});

test("each Closed cell equals the ticket list it links to", async ({ page }) => {
  await signInAs(page, PERSONA.ADMIN);
  await page.goto("/dashboards/boroughs?days=30");
  const rows = page.getByTestId("borough-row");
  const n = await rows.count();

  let checked = 0;
  for (let i = 0; i < n; i++) {
    const cells = rows.nth(i).locator("td");
    const label = (await cells.nth(0).innerText()).trim();
    if (label === "Unassigned") continue; // not a filterable value
    const cellValue = num(await cells.nth(7).innerText());
    const link = cells.nth(7).locator("a");
    if ((await link.count()) === 0) continue; // zero cells aren't linked

    const href = await link.getAttribute("href");
    // The bound is what makes this honest: state=CLOSED alone returns
    // every closure in the system's history, not the window.
    expect(href, `${label} Closed link must bound the window`).toContain(
      "closedSince=",
    );
    await page.goto(href!);
    expect(
      await matchingTicketCount(page),
      `${label}: Closed cell vs the list it links to`,
    ).toBe(cellValue);
    checked += 1;
    await page.goto("/dashboards/boroughs?days=30");
  }
  expect(checked, "no borough had closures to verify").toBeGreaterThan(0);
});

test("the Aging KPI equals the ticket list it links to", async ({ page }) => {
  await signInAs(page, PERSONA.ADMIN);
  await page.goto("/dashboards");
  const card = page.locator('a[href*="ageDays=gte"]').first();
  await expect(card, "the aging KPI must emit an ageDays link").toHaveCount(1);
  // The value div, not the whole card: the label "Aging > 30d"
  // contributes digits of its own.
  const cardValue = num(await card.locator("div").last().innerText());
  const href = await card.getAttribute("href");

  await page.goto(href!);
  expect(await matchingTicketCount(page)).toBe(cardValue);
});

test("a district-scoped user is only offered boroughs they can see", async ({
  page,
}) => {
  // Offering all five to a Bronx dispatcher means they can pick a
  // borough that renders zeroes everywhere, which reads as "no work
  // here" rather than "not yours".
  await signInAs(page, PERSONA.DISPATCHER);
  await page.goto("/dashboards");
  const options = await page
    .locator('select[name="borough"] option')
    .allInnerTexts();
  expect(options.length).toBeGreaterThan(1); // "All boroughs" + at least one
  expect(options.some((o) => o.includes("Bronx"))).toBe(true);
  expect(
    options.some((o) => o.includes("Manhattan") || o.includes("Queens")),
    "a Bronx-scoped user must not be offered other boroughs",
  ).toBe(false);
});

test("the borough survives switching dashboard tabs", async ({ page }) => {
  await signInAs(page, PERSONA.ADMIN);
  await page.goto("/dashboards?borough=Bronx");
  // Losing it here is silent: the Finance page would render citywide
  // money under a heading the operator still believes says Bronx.
  await page.getByRole("link", { name: "Finance" }).click();
  await expect(page).toHaveURL(/\/dashboards\/finance\?borough=Bronx/);
});
