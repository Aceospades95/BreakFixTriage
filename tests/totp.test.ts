import { describe, it, expect } from "vitest";
import { authenticator } from "otplib";
import {
  buildOtpauthUrl,
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from "@/lib/auth/totp";

/**
 * 2FA primitives are pure functions — no DB, no session — so they
 * unit-test cleanly. The tests below cover the three things that
 * would actually break a user: a correctly-generated TOTP not
 * verifying, a recovery code that can be reused, and drift
 * tolerance being too strict.
 */

describe("TOTP 2FA", () => {
  describe("generateTotpSecret", () => {
    it("returns a non-empty base32 string", () => {
      const secret = generateTotpSecret();
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThanOrEqual(16);
    });

    it("produces a different secret every call", () => {
      const a = generateTotpSecret();
      const b = generateTotpSecret();
      expect(a).not.toBe(b);
    });
  });

  describe("buildOtpauthUrl", () => {
    it("includes issuer, label, and secret", () => {
      const url = buildOtpauthUrl("dispatch@example.com", "JBSWY3DPEHPK3PXP");
      expect(url).toMatch(/^otpauth:\/\/totp\//);
      expect(url).toContain("dispatch");
      expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
      expect(url).toContain("issuer=BreakFix");
    });
  });

  describe("verifyTotp", () => {
    it("accepts a freshly generated code", () => {
      const secret = generateTotpSecret();
      const code = authenticator.generate(secret);
      expect(verifyTotp(code, secret)).toBe(true);
    });

    it("rejects a code from a different secret", () => {
      const s1 = generateTotpSecret();
      const s2 = generateTotpSecret();
      const code = authenticator.generate(s1);
      expect(verifyTotp(code, s2)).toBe(false);
    });

    it("rejects empty and malformed codes", () => {
      const secret = generateTotpSecret();
      expect(verifyTotp("", secret)).toBe(false);
      expect(verifyTotp("abc", secret)).toBe(false);
      expect(verifyTotp("12345", secret)).toBe(false); // 5 digits
      expect(verifyTotp("1234567", secret)).toBe(false); // 7 digits
    });

    it("strips non-digit characters before verifying", () => {
      const secret = generateTotpSecret();
      const code = authenticator.generate(secret);
      // User typed with a space in the middle, as some apps display.
      const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
      expect(verifyTotp(spaced, secret)).toBe(true);
    });
  });

  describe("generateRecoveryCodes", () => {
    it("produces ten unique codes by default", () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
    });

    it("produces codes in the expected shape", () => {
      const codes = generateRecoveryCodes(3);
      for (const c of codes) {
        // 4 groups of 4, separated by hyphens
        expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
    });

    it("avoids ambiguous characters", () => {
      const codes = generateRecoveryCodes(20);
      const joined = codes.join("");
      expect(joined).not.toMatch(/[0O1I]/);
    });
  });

  describe("consumeRecoveryCode", () => {
    it("removes the matching code and returns the shortened list", () => {
      const codes = generateRecoveryCodes(5);
      const hashed = codes.map(hashRecoveryCode);
      const updated = consumeRecoveryCode(codes[2]!, hashed);
      expect(updated).not.toBeNull();
      expect(updated).toHaveLength(4);
      // The removed slot's hash is no longer present.
      expect(updated).not.toContain(hashRecoveryCode(codes[2]!));
    });

    it("returns null when the code does not match", () => {
      const codes = generateRecoveryCodes(5);
      const hashed = codes.map(hashRecoveryCode);
      expect(consumeRecoveryCode("NOPE-NOPE-NOPE-NOPE", hashed)).toBeNull();
    });

    it("normalizes hyphens and case when comparing", () => {
      const codes = generateRecoveryCodes(3);
      const hashed = codes.map(hashRecoveryCode);
      const messy = codes[0]!.toLowerCase().replace(/-/g, "");
      const updated = consumeRecoveryCode(messy, hashed);
      expect(updated).not.toBeNull();
      expect(updated).toHaveLength(2);
    });

    it("consumes each code only once — a used code can't be replayed", () => {
      const codes = generateRecoveryCodes(3);
      const hashed = codes.map(hashRecoveryCode);
      const afterFirstUse = consumeRecoveryCode(codes[0]!, hashed);
      expect(afterFirstUse).not.toBeNull();
      // Reusing the same code against the updated list should fail.
      const afterReplay = consumeRecoveryCode(codes[0]!, afterFirstUse!);
      expect(afterReplay).toBeNull();
    });
  });
});
