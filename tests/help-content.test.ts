import { describe, expect, it } from "vitest";
import {
  FAQ_ENTRIES,
  GUIDE_SECTIONS,
  parseSops,
} from "@/lib/help/content";

/**
 * Round-22 (demo feedback) — help-center content pins.
 */

describe("parseSops", () => {
  it("splits ## headings into titled sections", () => {
    const out = parseSops(
      "## Device intake\nScan at the door.\nStamp the date.\n\n## Printers\nRecord model + IP.",
    );
    expect(out).toEqual([
      { title: "Device intake", body: "Scan at the door.\nStamp the date." },
      { title: "Printers", body: "Record model + IP." },
    ]);
  });

  it("content before any heading becomes an untitled intro", () => {
    const out = parseSops("General rule: update ServiceNow too.\n## A\nbody");
    expect(out[0]).toEqual({
      title: "",
      body: "General rule: update ServiceNow too.",
    });
    expect(out[1]?.title).toBe("A");
  });

  it("empty input yields no sections", () => {
    expect(parseSops("")).toEqual([]);
    expect(parseSops("\n\n  \n")).toEqual([]);
  });
});

describe("help content", () => {
  it("guide + FAQ are populated and unique", () => {
    expect(GUIDE_SECTIONS.length).toBeGreaterThanOrEqual(8);
    expect(FAQ_ENTRIES.length).toBeGreaterThanOrEqual(8);
    const titles = GUIDE_SECTIONS.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("answers the demo's SLA business-days question", () => {
    const sla = FAQ_ENTRIES.find((f) => /weekend/i.test(f.q));
    expect(sla?.a).toMatch(/business days/i);
  });
});
