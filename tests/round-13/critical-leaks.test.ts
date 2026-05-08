import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-13 §1A-§1D structural gates.
 *
 *   §1A — /people redirect ships
 *   §1B — CHANGE STATUS (ADMIN) drops "(AWAITING_ONSITE)" suffix
 *   §1C — /my-day team queues humanise role enum
 *   §1D — /admin/email-rules wraps tokens in <code>
 */

describe("Round-13 §1A — sidebar /people redirect", () => {
  it("/people page exists and redirects to /scheduling/people", () => {
    const path = join(ROOT, "src/app/(app)/people/page.tsx");
    expect(existsSync(path)).toBe(true);
    const src = read("src/app/(app)/people/page.tsx");
    expect(src).toContain('redirect("/scheduling/people")');
    expect(src).toContain('from "next/navigation"');
  });

  it("routes manifest includes /people with redirectsTo set", () => {
    const src = read("src/lib/routes-manifest.ts");
    expect(src).toContain('path: "/people"');
    expect(src).toContain('redirectsTo: "/scheduling/people"');
  });

  it("every sidebar href is in the routes manifest", async () => {
    const { assertSidebarHrefsAreKnownRoutes } = await import(
      "../../src/lib/routes-manifest"
    );
    expect(() => assertSidebarHrefsAreKnownRoutes()).not.toThrow();
  });
});

describe("Round-13 §1B — CHANGE STATUS (ADMIN) enum suffix dropped", () => {
  const src = read("src/components/force-change-form.tsx");

  it("option text has no parens-and-uppercase enum suffix", () => {
    expect(src).not.toMatch(/\{s\.label\}\s*\(\{s\.state\}\)/);
    expect(src).toMatch(/<option[^>]*>\s*\{s\.label\}\s*<\/option>/);
  });

  it("raw enum is preserved on the option via data-state-key", () => {
    expect(src).toContain("data-state-key={s.state}");
  });
});

describe("Round-13 §1C — /my-day TEAM QUEUES humanises role", () => {
  const src = read("src/app/(app)/page.tsx");

  it("imports formatRole from @/lib/format", () => {
    expect(src).toMatch(/import \{ formatRole \} from "@\/lib\/format"/);
  });

  it("renders user.role through formatRole, not raw", () => {
    expect(src).toMatch(/formatRole\(user\.role\)/);
    expect(src).not.toMatch(/\{user\?\.role \?\? "—"\}/);
  });
});

describe("Round-13 §1D — /admin/email-rules tokens render as <code>", () => {
  const src = read("src/app/(app)/admin/email-rules/page.tsx");

  it("Template column wraps rule.template.key in TokenChip", () => {
    expect(src).toContain("<TokenChip>{rule.template.key}</TokenChip>");
  });

  it("Recipients column uses RecipientChips with TokenChip per token", () => {
    expect(src).toContain("<RecipientChips recipients={rule.recipients}");
    expect(src).toContain("function RecipientChips");
    expect(src).toContain("function TokenChip");
  });

  it("TokenChip wraps in <code> with data-token-chip attribute", () => {
    expect(src).toMatch(/<code\s+data-token-chip/);
    // Pinned monospace styling so it reads as a developer token.
    expect(src).toMatch(/font-mono\s+text-\[10px\]/);
  });

  it("removed the string-returning recipientSummary helper", () => {
    expect(src).not.toContain("function recipientSummary");
    expect(src).not.toContain('parts.join(" · ")');
  });
});
