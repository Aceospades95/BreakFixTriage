import { describe, it, expect } from "vitest";
import { generateTokenString } from "@/lib/portal/tokens";

describe("generateTokenString", () => {
  it("returns a base64url string", () => {
    const token = generateTokenString();
    // base64url uses [A-Za-z0-9_-], no padding
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is at least 40 characters of entropy", () => {
    const token = generateTokenString();
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("generates unique tokens on successive calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateTokenString());
    }
    // 100 calls should always produce 100 distinct tokens at this
    // entropy level.
    expect(seen.size).toBe(100);
  });
});
