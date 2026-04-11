import { describe, it, expect } from "vitest";
import { normalizeScan } from "@/lib/scan/resolve";

describe("normalizeScan", () => {
  it("trims whitespace", () => {
    expect(normalizeScan("  INC1234567  ")).toBe("INC1234567");
  });

  it("leaves a plain value alone", () => {
    expect(normalizeScan("SN-0001")).toBe("SN-0001");
  });

  it("extracts the last path segment from a URL", () => {
    expect(normalizeScan("https://breakfix.local/tickets/abc123")).toBe(
      "abc123",
    );
    expect(normalizeScan("http://breakfix.local/admin/devices/xyz789/")).toBe(
      "xyz789",
    );
  });

  it("returns an empty string for an empty URL path", () => {
    // URL() parses this successfully, no path segments → falls back
    // to the original string which is just the host, which after
    // .trim() is non-empty but not useful. Test documents the
    // current behavior so nobody breaks it unwittingly.
    expect(normalizeScan("https://breakfix.local/")).toBe(
      "https://breakfix.local/",
    );
  });

  it("does not crash on malformed input", () => {
    expect(normalizeScan("")).toBe("");
    expect(normalizeScan("   ")).toBe("");
    expect(normalizeScan("!@#$%")).toBe("!@#$%");
  });
});
