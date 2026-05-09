import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §1B — /tickets/[id] URL canonicalisation gate.
 *
 * Canonical URL is /tickets/<incidentNumber>. A request for
 * /tickets/<cuid> 308-redirects to the incidentNumber form. Every
 * internal link generator in the UI must emit the incidentNumber
 * path so the cuid never hits the user's history / clipboard /
 * referer headers.
 */

describe("Round-12 §1B — URL canonicalisation", () => {
  it("ticket detail page imports permanentRedirect", () => {
    const src = read("src/app/(app)/tickets/[ticketId]/page.tsx");
    expect(src).toContain("permanentRedirect");
    expect(src).toContain('from "next/navigation"');
  });

  it("ticket detail page detects cuid params and 308-redirects to canonical incidentNumber", () => {
    const src = read("src/app/(app)/tickets/[ticketId]/page.tsx");
    expect(src).toContain("isCuidParam");
    expect(src).toMatch(/permanentRedirect\(`\/tickets\/\$\{byId\.incidentNumber\}`\)/);
  });

  it("ticket detail page accepts incidentNumber lookups directly", () => {
    const src = read("src/app/(app)/tickets/[ticketId]/page.tsx");
    expect(src).toContain("isHumanReadableParam");
    expect(src).toMatch(/incidentNumber:\s*params\.ticketId\.toUpperCase\(\)/);
  });

  it("merge-redirect uses target.incidentNumber, falling back to id", () => {
    const src = read("src/app/(app)/tickets/[ticketId]/page.tsx");
    expect(src).toMatch(/ticket\.mergedInto\.incidentNumber\s*\?\?\s*ticket\.mergedIntoTicketId/);
  });

  it("EmailLog schema has ticket relation so /admin/email-log can canonicalise", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/ticket\s+Ticket\?\s+@relation\("EmailLogToTicket"/);
    expect(schema).toMatch(/emailLogs\s+EmailLog\[\]\s+@relation\("EmailLogToTicket"\)/);
  });

  it("no UI file builds a /tickets/<cuid> link", () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry)) continue;
        if (/\.test\.tsx?$/.test(entry)) continue;
        // Server actions are allowed to redirect to /tickets/<cuid>
        // since the page-level handler canonicalises. UI link
        // generators are NOT.
        if (full.includes("/server/actions/")) continue;
        const src = readFileSync(full, "utf8");
        // Match: href={`/tickets/${something.id}`}
        const matches = src.match(
          /href=\{`\/tickets\/\$\{[A-Za-z_][A-Za-z0-9_.]*\.id\}`/g,
        );
        if (matches) {
          offenders.push(`${full.replace(`${ROOT}/`, "")} (${matches.length} matches)`);
        }
      }
    }
    walk(join(ROOT, "src/app"));
    walk(join(ROOT, "src/components"));
    expect(
      offenders,
      `UI links must use incidentNumber, not cuid. Offenders: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("kanban-board uses t.incidentNumber for card links", () => {
    const src = read("src/components/kanban-board.tsx");
    expect(src).toContain("href={`/tickets/${t.incidentNumber}`}");
    expect(src).not.toContain("href={`/tickets/${t.id}`}");
  });
});
