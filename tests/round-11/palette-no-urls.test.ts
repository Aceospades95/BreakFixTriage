import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

/**
 * Round-11 §1A — Cmd+K palette must not surface raw URL paths in
 * user-facing JSX. The `hint` field renders directly inside the
 * palette result row; before R11 it carried strings like
 * `/tickets/INC2200126` and `Filter on /admin/schools`. Same class
 * of leak we fixed in R10 §1C for the bench card.
 */

describe("Round-11 §1A — Cmd+K palette no URL leak", () => {
  const src = readFileSync(
    join(ROOT, "src/components/command-palette.tsx"),
    "utf8",
  );

  it("detectSpecial ticket result has a humanised hint, not a URL path", () => {
    expect(src).toMatch(/label: `Open ticket \$\{upper\}`,\s*hint: "Ticket"/);
    expect(src).not.toMatch(/hint: `\/tickets/);
  });

  it("detectSpecial school result hint is humanised", () => {
    expect(src).toContain('hint: "Filter the schools list"');
    expect(src).not.toContain('hint: "Filter on /admin/schools"');
  });

  it("detectSpecial device result hint is humanised", () => {
    expect(src).toContain('hint: "Search the devices list"');
    expect(src).not.toContain('hint: "Search on /admin/devices"');
  });

  it("no PaletteItem hint string starts with a forward slash", () => {
    // Match every string literal that's used as a hint:
    const hintLines = src.match(/hint:\s*(["`])([^"`]*)\1/g) ?? [];
    expect(hintLines.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const line of hintLines) {
      const value = line.replace(/^hint:\s*["`]/, "").replace(/["`]$/, "");
      if (/^\//.test(value)) offenders.push(value);
    }
    expect(
      offenders,
      `Palette hint values must not start with a URL path: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("no PaletteItem label string starts with a forward slash", () => {
    const labelLines = src.match(/label:\s*(["`])([^"`]*)\1/g) ?? [];
    expect(labelLines.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const line of labelLines) {
      const value = line.replace(/^label:\s*["`]/, "").replace(/["`]$/, "");
      if (/^\//.test(value)) offenders.push(value);
    }
    expect(
      offenders,
      `Palette label values must not start with a URL path: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
