import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-11 — Round-10 regression suite.
 *
 * 13 structural assertions per the R11 brief. Each item is a
 * Round-10 leaf the brief says PASSES in production today and
 * must NOT regress as Round-11 lands.
 *
 * The Playwright variants (which exercise the live DOM in a
 * browser) are filed in docs/round-11-backlog.md and unblock when
 * §2D CI Postgres + Playwright runtime ship.
 */

describe("Round-11: Round-10 regression suite (13 leaves)", () => {
  // --- 1. /duplicates empty-state guard ---
  it("/duplicates suppresses 'queue is clean' when SYN list is non-empty", () => {
    const src = read("src/app/(app)/duplicates/page.tsx");
    expect(src).toMatch(/conflicts\.length === 0\s*&&[\s\S]*?showResolved \|\| unlinkedSynthetics\.length === 0/);
  });

  // --- 2. /bench Unlinked card subtitle has no /duplicates substring ---
  it("/bench Unlinked card uses 'duplicate queue' phrasing, not /duplicates path", () => {
    const src = read("src/app/(app)/bench/page.tsx");
    expect(src).toContain("on-route synthetic · resolve in the duplicate queue");
    expect(src).toContain("Resolve in queue →");
    // No /duplicates substring inside the JSX text near the card.
    const bench = src.split("CompactTicketList")[1] ?? "";
    const directRef = bench.match(/>\s*\/duplicates/);
    expect(directRef).toBeNull();
  });

  // --- 3. /admin/holidays scope-and-district microcopy ---
  it("/admin/holidays district select disables on Global + helper text", () => {
    const src = read("src/app/(app)/admin/holidays/scope-and-district.tsx");
    expect(src).toContain("Required when the holiday only applies to a specific district.");
    expect(src).toContain("disabled={!isDistrict}");
  });

  // --- 4. Cmd+K palette anchors ---
  it("Cmd+K command palette renders placeholder + footer hints", () => {
    const src = read("src/components/command-palette.tsx");
    expect(src).toContain("Search nav, INC2200126, school code, SN-…");
    expect(src).toContain("↑↓ navigate · ↵ open · Esc close");
  });

  // --- 5. /tickets/kanban auto-refresh full label ---
  it("auto-refresh shows refreshes-every + last-updated label", () => {
    const src = read("src/components/auto-refresh.tsx");
    expect(src).toMatch(/refreshes every \{intervalSeconds\}s · last updated/);
  });

  // --- 6. /imports OUTCOME column single-line cell ---
  it("/imports OUTCOME cell uses tabular-nums + nowrap so the column holds at narrow widths", () => {
    const src = read("src/app/(app)/imports/page.tsx");
    expect(src).toContain("whitespace-nowrap");
    expect(src).toContain("tabular-nums");
    expect(src).toMatch(/created · \$\{stats\.updated \?\? 0\} updated · \$\{stats\.duplicates \?\? 0\} dupes · \$\{stats\.rejected \?\? 0\} rejected/);
  });

  // --- 7. /bench Pick up button on Unassigned ---
  it("/bench renders a Pick up button via pickUpEnabled prop", () => {
    const src = read("src/app/(app)/bench/page.tsx");
    expect(src).toMatch(/pickUpEnabled/);
    expect(src).toContain("Pick up");
  });

  // --- 8. /admin/email-rules amber CTA banner ---
  it("/admin/email-rules empty state shows Seed example rule banner", () => {
    const src = read("src/app/(app)/admin/email-rules/page.tsx");
    expect(src).toContain("Seed example rule");
    expect(src).toContain('href="/admin/email-templates"');
  });

  // --- 9. SLA badge tooltip extended copy ---
  it("SLA tooltip surfaces reported date + days-in-state + threshold", () => {
    const src = read("src/components/sla-badge.tsx");
    expect(src).toMatch(/Reported \$\{reportedDate\} · \$\{days\}d in \$\{humaniseEnum\(ticket\.state\)\}/);
    expect(src).toContain("threshold ${thresholdDays}d");
  });

  // --- 10. /scheduling/people keyboard shortcuts ---
  it("/scheduling/people binds t / [ / ] keys", () => {
    const src = read("src/app/(app)/scheduling/people/keyboard-shortcuts-island.tsx");
    expect(src).toMatch(/e\.key === "t"/);
    expect(src).toMatch(/e\.key === "\["/);
    expect(src).toMatch(/e\.key === "\]"/);
    expect(src).toContain("/scheduling/people?date=");
  });

  // --- 11. /admin Parts card live count ---
  it("/admin overview Parts card pulls live count from prisma", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toContain("prisma.part.count()");
    expect(src).toContain('title: "Parts"');
  });

  // --- 12. /me 404 fallback page renders sitemap ---
  it("global not-found shows Common destinations sitemap", () => {
    const src = read("src/app/(app)/not-found.tsx");
    expect(src).toContain('title="Page not found"');
    expect(src).toContain("Common destinations");
  });

  // --- 13. /dashboards/finance empty state has no emoji ---
  it("/dashboards/finance issued-PO empty state is sentence-case + no emoji", () => {
    const src = read("src/app/(app)/dashboards/finance/page.tsx");
    expect(src).toContain(
      "All caught up — every issued PO has been invoiced.",
    );
    // No leading emoji or trailing decorative glyph on the line:
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}]\s*All caught up/u);
  });
});
