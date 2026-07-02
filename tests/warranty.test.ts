import { describe, expect, it } from "vitest";
import {
  caseUrlFor,
  isOutOfWarranty,
  parseCaseUrlTemplates,
  validateCaseUrlTemplates,
  warrantyStatus,
} from "@/lib/warranty";

/**
 * Round-22 (demo feedback) — warranty status + vendor case-link
 * templates.
 */

const NOW = new Date("2026-06-18T12:00:00Z");

describe("warrantyStatus", () => {
  it("classifies in / out / unknown", () => {
    expect(warrantyStatus(new Date("2027-01-01"), NOW).kind).toBe("in");
    expect(warrantyStatus(new Date("2025-01-01"), NOW).kind).toBe("out");
    expect(warrantyStatus(null, NOW).kind).toBe("unknown");
    expect(warrantyStatus(undefined, NOW).kind).toBe("unknown");
  });

  it("isOutOfWarranty is true only for a past expiry", () => {
    expect(isOutOfWarranty(new Date("2025-01-01"), NOW)).toBe(true);
    expect(isOutOfWarranty(new Date("2027-01-01"), NOW)).toBe(false);
    // Unknown is NOT out — we warn on known-expired only.
    expect(isOutOfWarranty(null, NOW)).toBe(false);
  });

  it("the expiry day itself is still in warranty (dates are date-only)", () => {
    // NOW is midday June 18; a warranty that "expires 2026-06-18"
    // covers the whole day and flips at midnight UTC.
    expect(warrantyStatus(new Date("2026-06-18T00:00:00Z"), NOW).kind).toBe(
      "in",
    );
    expect(warrantyStatus(new Date("2026-06-17T00:00:00Z"), NOW).kind).toBe(
      "out",
    );
  });
});

describe("case URL templates", () => {
  const RAW = [
    "# vendors with predictable case URLs",
    "Apple = https://gsx.apple.com/cases/{case}",
    "Dell=https://www.dell.com/support/case/{case}?src=triage",
    "broken line without equals",
    "NoPlaceholder = https://example.com/case",
    "NotAUrl = ftp://example.com/{case}",
  ].join("\n");

  it("parses valid lines, skips comments and malformed ones", () => {
    const t = parseCaseUrlTemplates(RAW);
    expect(Object.keys(t).sort()).toEqual(["apple", "dell"]);
    expect(t.apple).toBe("https://gsx.apple.com/cases/{case}");
  });

  it("resolves vendor case URLs case-insensitively with encoding", () => {
    const t = parseCaseUrlTemplates(RAW);
    expect(caseUrlFor("APPLE", "GSX 123/45", t)).toBe(
      "https://gsx.apple.com/cases/GSX%20123%2F45",
    );
    expect(caseUrlFor("Lenovo", "L1", t)).toBeNull();
  });

  it("validate reports each malformed line in plain language", () => {
    const problems = validateCaseUrlTemplates(RAW);
    expect(problems.length).toBe(3);
    expect(problems.join(" ")).toMatch(/\{case\} placeholder/);
    expect(problems.join(" ")).toMatch(/http\(s\)/);
  });

  it("empty / null input parses to no templates", () => {
    expect(parseCaseUrlTemplates("")).toEqual({});
    expect(parseCaseUrlTemplates(null)).toEqual({});
  });

  it("prototype-key vendors resolve to nothing, not to Object internals", () => {
    const t = parseCaseUrlTemplates(RAW);
    expect(caseUrlFor("constructor", "X1", t)).toBeNull();
    expect(caseUrlFor("__proto__", "X1", t)).toBeNull();
    expect(caseUrlFor("toString", "X1", t)).toBeNull();
  });

  it("non-http templates never become links, even if handed in directly", () => {
    // Defense in depth: parse enforces http(s), but caseUrlFor must
    // hold the line when given an arbitrary map (e.g. a hand-edited
    // AppSetting row).
    expect(
      caseUrlFor("evil", "X1", { evil: "javascript:alert({case})" }),
    ).toBeNull();
    expect(caseUrlFor("evil", "X1", { evil: "data:text/html,{case}" })).toBeNull();
  });
});
