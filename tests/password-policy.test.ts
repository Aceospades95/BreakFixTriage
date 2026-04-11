import { describe, it, expect } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from "@/lib/auth/password-policy";

describe("validatePassword", () => {
  it("accepts a strong passphrase", () => {
    expect(validatePassword("correct-horse-battery-staple-9").ok).toBe(true);
    expect(validatePassword("Tr0ubadour&Salmon").ok).toBe(true);
  });

  it("rejects passwords shorter than the minimum", () => {
    const r = validatePassword("Ab1!short");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("at least"))).toBe(true);
    }
  });

  it("rejects passwords with only one character class", () => {
    const r = validatePassword("aaaaaaaaaaaaaa");
    expect(r.ok).toBe(false);
  });

  it("rejects a single repeated character even at length", () => {
    const r = validatePassword("aaaaaaaaaaa");
    expect(r.ok).toBe(false);
  });

  it("rejects well-known passwords", () => {
    for (const bad of ["password1", "letmein", "admin123"]) {
      const r = validatePassword(bad);
      expect(r.ok).toBe(false);
    }
  });

  it("returns multiple errors when multiple rules fail", () => {
    const r = validatePassword("abc");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThan(1);
    }
  });

  it("requires at least two character classes", () => {
    // Single-class (all lowercase) should fail.
    expect(validatePassword("lowercaseonly").ok).toBe(false);
    // Two-class variants of the same length should pass.
    expect(validatePassword("lowercaseonly!").ok).toBe(true);
    expect(validatePassword("lowercaseonly1").ok).toBe(true);
    expect(validatePassword("MIXED-case-1234").ok).toBe(true);
  });

  it("exports a minimum length constant used by the implementation", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });

  it("handles non-string input gracefully", () => {
    // @ts-expect-error — runtime safety test
    const r = validatePassword(null);
    expect(r.ok).toBe(false);
  });
});
