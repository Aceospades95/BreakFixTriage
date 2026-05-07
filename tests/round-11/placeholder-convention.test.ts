import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-11 §1B — placeholder convention gate.
 *
 * Every "example value" placeholder in the app must use the form
 * `e.g. <value>`. The full inventory + decision rule lives in
 * docs/round-11-placeholder-audit.md.
 *
 * The gate spot-checks the R11 changes — every line below
 * represents a placeholder we deliberately moved.
 */

describe("Round-11 §1B — placeholder convention", () => {
  it("/duplicates SNOW INC# uses e.g. INC1234567", () => {
    const src = read("src/app/(app)/duplicates/page.tsx");
    expect(src).toContain('placeholder="e.g. INC1234567"');
    expect(src).not.toContain('placeholder="INC#"');
  });

  it("admin/holidays label placeholder is example-prefixed", () => {
    expect(read("src/app/(app)/admin/holidays/page.tsx")).toContain(
      'placeholder="e.g. Memorial Day"',
    );
  });

  it("admin/parts/new ships e.g. across SKU + name + cost + location", () => {
    const src = read("src/app/(app)/admin/parts/new/page.tsx");
    expect(src).toContain('placeholder="e.g. SCREEN-EB14"');
    expect(src).toContain('placeholder="e.g. 14-inch replacement screen"');
    expect(src).toContain('placeholder="e.g. 89.00"');
    expect(src).toContain('placeholder="e.g. A3-shelf-2"');
  });

  it("admin/districts ships e.g. across name + code + region", () => {
    const src = read("src/app/(app)/admin/districts/page.tsx");
    expect(src).toContain('placeholder="e.g. Bronx"');
    expect(src).toContain('placeholder="e.g. BRONX"');
    expect(src).toContain('placeholder="e.g. NYC"');
  });

  it("admin/schools/new ships e.g. across DBN + name + lat + lon", () => {
    const src = read("src/app/(app)/admin/schools/new/page.tsx");
    expect(src).toContain('placeholder="e.g. 11X101"');
    expect(src).toContain('placeholder="e.g. P.S. 101 Bronx"');
    expect(src).toContain('placeholder="e.g. 40.8448"');
    expect(src).toContain('placeholder="e.g. -73.8648"');
  });

  it("admin/devices/new ships e.g. across manufacturer + model + warranty", () => {
    const src = read("src/app/(app)/admin/devices/new/page.tsx");
    expect(src).toContain('placeholder="e.g. Acme"');
    expect(src).toContain('placeholder="e.g. EduBook 14"');
    expect(src).toContain('placeholder="e.g. 36"');
  });

  it("invoices page ships e.g. for PO + amount", () => {
    const src = read("src/app/(app)/invoices/page.tsx");
    expect(src).toContain('placeholder="e.g. PO-2025-00123"');
    expect(src).toContain('placeholder="e.g. 199.00"');
  });

  it("profile/2fa code inputs are e.g. prefixed (×2)", () => {
    const src = read("src/app/(app)/profile/2fa/page.tsx");
    const matches = (src.match(/placeholder="e\.g\. 123456"/g) ?? []).length;
    expect(matches).toBe(2);
  });

  it("scan client + warehouse scan use e.g. for the manual entry hint", () => {
    expect(read("src/app/(app)/scan/scan-client.tsx")).toContain(
      'placeholder="e.g. INC2200126, SN-1234, BX-101"',
    );
    expect(read("src/app/(app)/scan/warehouse/scan-warehouse-client.tsx")).toContain(
      'placeholder="e.g. SN-0001 / AT-0001"',
    );
  });

  it("audit doc lists every R11 change", () => {
    const doc = read("docs/round-11-placeholder-audit.md");
    expect(doc).toContain("e.g. INC1234567");
    expect(doc).toContain("e.g. Memorial Day");
    expect(doc).toContain("e.g. SCREEN-EB14");
    expect(doc).toContain("e.g. P.S. 101 Bronx");
    expect(doc).toContain("e.g. PO-2025-00123");
  });
});
