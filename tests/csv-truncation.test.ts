import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CSV_TRUNCATION_HEADER,
  truncationHeaders,
  withTruncationNotice,
} from "@/lib/reports/csv-export";

/**
 * CSV exports must say what they left out.
 *
 * Every export caps its query (10k or 50k rows) and nothing told the
 * person who downloaded it. A year-end ticket export returned the
 * first 10,000 of 40,000+ rows and looked complete — a reconciliation
 * built on that file is wrong in a way no one can see.
 */

const ROOT = join(__dirname, "..");
const EXPORT_DIR = join(ROOT, "src/app/api/exports");

describe("truncation helpers", () => {
  it("stays silent when nothing was dropped", () => {
    expect(withTruncationNotice("a\nb\n", 2, 2)).toBe("a\nb\n");
    const h = truncationHeaders(2, 2);
    expect(h[CSV_TRUNCATION_HEADER]).toBeUndefined();
    expect(h["X-Export-Row-Count"]).toBe("2");
  });

  it("appends a visible final row and sets headers when rows were dropped", () => {
    const out = withTruncationNotice("a\nb\n", 2, 40123);
    expect(out).toContain("TRUNCATED");
    expect(out).toContain("40,123");
    // The notice must be the LAST line, so it survives a scroll to the
    // bottom in Excel rather than hiding mid-file.
    const lines = out.trimEnd().split("\n");
    expect(lines[lines.length - 1]).toContain("TRUNCATED");

    const h = truncationHeaders(2, 40123);
    expect(h[CSV_TRUNCATION_HEADER]).toBe("true");
    expect(h["X-Export-Total-Count"]).toBe("40123");
  });

  it("escapes the notice so a comma cannot break the row", () => {
    const out = withTruncationNotice("a\n", 1, 99, "Narrow by borough, then retry.");
    const last = out.trimEnd().split("\n").pop()!;
    expect(last.startsWith('"')).toBe(true);
    expect(last.endsWith('"')).toBe(true);
  });
});

describe("every capped CSV export reports its truncation", () => {
  // Structural gate: a new export route that caps rows without a
  // truncation signal is the exact regression this suite exists to
  // stop, and it is invisible in any functional test that happens to
  // stay under the cap.
  const routes = readdirSync(EXPORT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      path: join(EXPORT_DIR, d.name, "route.ts"),
    }))
    .filter((r) => {
      try {
        return !!readFileSync(r.path, "utf8");
      } catch {
        return false;
      }
    });

  it("finds the export routes", () => {
    expect(routes.length).toBeGreaterThan(4);
  });

  for (const route of routes) {
    const src = readFileSync(route.path, "utf8");
    const capped = /take:\s*\d{3,}/.test(src);
    it(`${route.name}${capped ? "" : " (uncapped — exempt)"}`, () => {
      if (!capped) return;
      expect(
        src.includes("withTruncationNotice"),
        `${route.name} caps rows but never appends a truncation notice`,
      ).toBe(true);
      expect(
        src.includes("truncationHeaders"),
        `${route.name} caps rows but never sets a truncation header`,
      ).toBe(true);
      expect(
        src.includes(".count("),
        `${route.name} caps rows but never counts the true total`,
      ).toBe(true);
    });
  }
});
