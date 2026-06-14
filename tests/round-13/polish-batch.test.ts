import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-13 §3 polish batch.
 *
 *   §3A — quotes filter pill counts
 *   §3B — Aging > 30d card link + SLA breached card link
 *   §3C — /invoices empty-state migrated to <EmptyState>
 *   §3D — /scheduling/people forward arrow header reflection
 *   §3E — admin overview kebab hit area expanded to 44×44
 *   §3F — /admin/email-rules seed example button disabled when rule exists
 *   §3G — /admin/holidays empty-state shows "Seed defaults" form
 *   §3H — Recent sessions panel renders "Unknown device" fallback
 */

describe("Round-13 §3A — quotes filter pill counts", () => {
  const src = read("src/app/(app)/quotes/page.tsx");

  it("count is rendered as a nested pill chip with rounded-full + tabular-nums", () => {
    expect(src).toMatch(/rounded-full[\s\S]*?tabular-nums/);
    expect(src).toMatch(/min-w-\[1\.25rem\]/);
  });

  it("active vs inactive count chips have distinct backgrounds", () => {
    expect(src).toContain("bg-accent/30");
    expect(src).toContain("bg-surface-border");
  });
});

describe("Round-13 §3B — KPI cards deep-link to filtered tickets", () => {
  it("Aging > 30d card links to /tickets?ageDays=gte:30", () => {
    const src = read("src/app/(app)/dashboards/page.tsx");
    expect(src).toMatch(/href="\/tickets\?ageDays=gte:30/);
  });

  it("SLA breached card links to /tickets?slaHealth=breached", () => {
    const src = read("src/app/(app)/page.tsx");
    expect(src).toMatch(/href="\/tickets\?slaHealth=breached&state=open"/);
  });
});

describe("Round-13 §3C — /invoices empty state uses <EmptyState>", () => {
  it("EmptyState component exists", () => {
    expect(existsSync(join(ROOT, "src/components/empty-state.tsx"))).toBe(true);
    const src = read("src/components/empty-state.tsx");
    expect(src).toContain("export function EmptyState");
    expect(src).toContain("function CircleCheckBigIcon");
  });

  it("/invoices imports + uses EmptyState", () => {
    const src = read("src/app/(app)/invoices/page.tsx");
    expect(src).toContain('from "@/components/empty-state"');
    expect(src).toContain("<EmptyState");
    expect(src).not.toContain("🎉");
  });
});

describe("Round-13 §3D — /scheduling/people header reflects current date", () => {
  const src = read("src/app/(app)/scheduling/people/page.tsx");

  it("subtitle reads the current date param via toISOString().slice(0, 10)", () => {
    expect(src).toMatch(/date\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it("forward arrow advances date in the URL", () => {
    // Round-22 §3.1 — the nav strides by the active view's unit now
    // (day/week/month), so the forward arrow uses strideDate(date, view, 1).
    expect(src).toMatch(/strideDate\(date,\s*view,\s*1\)/);
  });
});

describe("Round-13 §3E — admin kebab hit area expanded", () => {
  const src = read("src/components/admin-card-kebab.tsx");

  it("button is at least 44×44 (h-11 w-11) for WCAG touch-target compliance", () => {
    expect(src).toMatch(/h-11\s+w-11/);
  });

  it("kebab glyph stays small inside the larger hit area", () => {
    // The ⋯ character is wrapped in a span with leading-none; the
    // outer button's 44×44 size doesn't enlarge the glyph.
    expect(src).toMatch(/text-base\s+leading-none/);
  });
});

describe("Round-13 §3F / Round-22 — Seed example button only in the empty state", () => {
  const src = read("src/app/(app)/admin/email-rules/page.tsx");

  it("seed button renders only when there are no rules", () => {
    // Round-22 turned the page into a real editor: the seed button
    // moved into the empty-state block (rules.length === 0), so it
    // is structurally absent once any rule exists — the old
    // duplicate-seed guard is no longer needed.
    expect(src).toMatch(/rules\.length === 0 \?/);
    expect(src).toContain("seedExampleRuleAction");
  });

  it("seed button stays disabled for non-managers", () => {
    expect(src).toMatch(/disabled=\{!canManage\}/);
  });
});

describe("Round-13 §3G — /admin/holidays empty state with Seed defaults", () => {
  const src = read("src/app/(app)/admin/holidays/page.tsx");

  it("imports the seed action", () => {
    expect(src).toContain("seedFederalHolidaysAction");
  });

  it("empty-state form posts year as a hidden input", () => {
    expect(src).toMatch(/<input type="hidden" name="year" value=\{year\}/);
  });

  it("button copy includes the active year", () => {
    expect(src).toMatch(/Seed \{year\} federal holidays/);
  });

  it("seed action accepts an optional year form field", () => {
    const action = read("src/server/actions/holidays.ts");
    expect(action).toMatch(/formData\?\.get\("year"\)/);
    expect(action).toMatch(/yearParsed >= 2000 && yearParsed <= 2100/);
  });
});

describe("Round-13 §3H — Recent sessions panel Unknown device fallback", () => {
  const src = read("src/app/(app)/admin/users/[userId]/page.tsx");

  it("renders 'Unknown device' when both ipHash + uaFingerprint null", () => {
    expect(src).toContain('"Unknown device"');
    expect(src).toMatch(/const isUnknown = ip == null && ua == null/);
  });
});
