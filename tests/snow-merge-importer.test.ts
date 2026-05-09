import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Round-7 §3C — importer-side synthetic auto-merge.
 *
 * The full integration test (seed synthetic, run import, assert
 * merge happened on a live Postgres) is filed in
 * docs/round-7-backlog.md alongside the §3A integration test —
 * both need a CI Postgres + a fake-mailer transport that aren't
 * provisioned in the audit env.
 *
 * The structural assertions below cover the wiring that drives
 * the auto-merge:
 *
 *   1. reconcileSnowImport calls mergeTicket() (G7 invariant: not a
 *      silent merge — mergeTicket writes the operator-readable
 *      audit + comment trail).
 *   2. The pipeline wires reconcileSnowImport into the commit path
 *      and threads its counts into the stats blob.
 *   3. ImportResult declares the new mergedFromSynthetic +
 *      crossSchoolCollisions counters.
 *   4. The /imports list renders a "merged-from-synthetic" outcome
 *      bucket.
 *
 * The pure matchSynthsToImports() unit tests (tests/snow-merge.
 * test.ts) still cover the matcher contract — Round-7 doesn't
 * change that function.
 */

const ROOT = process.cwd();

describe("Round-7 §3C: importer-side synthetic auto-merge wiring", () => {
  it("reconcileSnowImport calls mergeTicket()", () => {
    const src = readFileSync(join(ROOT, "src/lib/snow-merge.ts"), "utf8");
    expect(src).toMatch(/import\s*{\s*mergeTicket\s*}\s*from/);
    expect(src).toMatch(/await\s+mergeTicket\s*\(/);
  });

  it("reconcileSnowImport handles cross-school collisions without merging", () => {
    const src = readFileSync(join(ROOT, "src/lib/snow-merge.ts"), "utf8");
    expect(src).toMatch(/cross-school/i);
    expect(src).toMatch(/snow-merge\.cross-school-collision/);
    // The cross-school path posts a comment but does NOT call
    // mergeTicket (the "investigate manually" trail). Anchor the
    // section on the first "for (const synth of otherSchool)" line
    // so we only assert about the cross-school branch body.
    const idx = src.indexOf("for (const synth of otherSchool)");
    expect(idx).toBeGreaterThan(0);
    const crossSection = src.slice(idx);
    expect(crossSection).not.toMatch(/await\s+mergeTicket/);
  });

  it("reconcileSnowImport handles multi-synthetic edge case", () => {
    const src = readFileSync(join(ROOT, "src/lib/snow-merge.ts"), "utf8");
    expect(src).toMatch(/snow-merge\.runner-up/);
    expect(src).toMatch(/Multiple synthetics/);
  });

  it("pipeline wires reconcileSnowImport + threads counts into stats", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/import/pipeline.ts"),
      "utf8",
    );
    expect(src).toMatch(/import\s*{\s*reconcileSnowImport\s*}\s*from/);
    expect(src).toMatch(/await\s+reconcileSnowImport/);
    expect(src).toMatch(/mergedFromSynthetic:\s*reconcile\.mergedFromSynthetic/);
  });

  it("ImportResult carries the new R7 §3C counters", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/import/pipeline.ts"),
      "utf8",
    );
    expect(src).toMatch(/mergedFromSynthetic\?:\s*number/);
    expect(src).toMatch(/crossSchoolCollisions\?:\s*number/);
  });

  it("/imports list renders the merged-from-synthetic outcome bucket", () => {
    const src = readFileSync(
      join(ROOT, "src/app/(app)/imports/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(/merged-from-synthetic/);
    expect(src).toMatch(/stats\.mergedFromSynthetic/);
  });

  it("G7 invariant: importer-side merge always writes audit + comment trail", () => {
    // The importer-side merge goes through mergeTicket, which is
    // already covered by tests/snow-merge.test.ts and the audit
    // smoke checks. This test asserts that snow-merge.ts itself
    // does NOT perform a `ticket.update` with state=CLOSED in any
    // path that bypasses mergeTicket() — the only state changes
    // happen via mergeTicket which carries the trail.
    const src = readFileSync(join(ROOT, "src/lib/snow-merge.ts"), "utf8");
    // No direct ticket update in the merge path (mergeTicket owns it).
    expect(src).not.toMatch(/db\.ticket\.update/);
  });
});
