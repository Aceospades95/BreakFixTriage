/**
 * TOTP 2FA helpers.
 *
 * Built on `otplib`, which implements RFC 6238 TOTP with a 30s
 * window. We use a small time drift tolerance (1 window) so a user
 * whose phone clock is 20s off can still sign in.
 *
 * Recovery codes are a separate mechanism: 10 single-use random
 * strings generated at enablement, stored hashed, and consumed
 * one-at-a-time when the user signs in with a code instead of a
 * fresh TOTP. This is the escape hatch for a lost authenticator.
 *
 * Everything that touches secrets lives here so the rest of the
 * app can talk in terms of "verify this code" without re-learning
 * the TOTP spec.
 */

import { createHash, randomBytes } from "node:crypto";
import { authenticator } from "otplib";
import bcrypt from "bcryptjs";

// Tolerate ±1 time step (30s) of clock drift on either side.
authenticator.options = {
  window: 1,
};

export const ISSUER = "BreakFix Triage";

/**
 * Generate a new base32 TOTP secret. 20 bytes of entropy encoded
 * as base32 yields a 32-character secret, which is the authenticator
 * convention.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Build the otpauth URL an authenticator app scans. `label` is
 * usually the user's email; `issuer` is the app name.
 */
export function buildOtpauthUrl(
  label: string,
  secret: string,
  issuer = ISSUER,
): string {
  return authenticator.keyuri(label, issuer, secret);
}

/**
 * Verify a six-digit TOTP code against a stored secret. Returns
 * false for empty, malformed, or drift-exceeded codes.
 */
export function verifyTotp(code: string, secret: string): boolean {
  const trimmed = (code ?? "").replace(/\D/g, "");
  if (trimmed.length !== 6) return false;
  try {
    return authenticator.verify({ token: trimmed, secret });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

const RECOVERY_CODE_COUNT = 10;

/**
 * Generate a human-typable recovery code. Four groups of four
 * base32 characters, separated by hyphens. Avoids ambiguous
 * characters (0/O, 1/I) so people can read them off a printed
 * sheet at 6am.
 */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const out: string[] = [];
  for (let i = 0; i < 16; i++) {
    out.push(alphabet[bytes[i]! % alphabet.length]!);
    if (i > 0 && i < 15 && (i + 1) % 4 === 0) out.push("-");
  }
  return out.join("");
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(generateCode());
  return out;
}

/**
 * Hash a recovery code for storage. We use a fast SHA-256 rather
 * than bcrypt because the codes are high-entropy (~80 bits) and
 * checked against a small fixed set — there's no realistic brute-
 * force concern. bcrypt would be slow enough to be a login DOS
 * vector if someone hammered the endpoint.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/-/g, "").toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Verify a submitted recovery code against a stored hashed list.
 * Returns the updated list (with the used code removed) on a
 * match, or null on no match. The caller is responsible for
 * persisting the new list — we don't touch the database here to
 * keep the helper pure.
 */
export function consumeRecoveryCode(
  submitted: string,
  hashedList: string[],
): string[] | null {
  const hash = hashRecoveryCode(submitted);
  const idx = hashedList.indexOf(hash);
  if (idx < 0) return null;
  return hashedList.filter((_, i) => i !== idx);
}

/**
 * bcrypt-based hash for cases where we *do* want the slow path —
 * unused today but kept here so the import story is one module.
 */
export async function bcryptHash(value: string): Promise<string> {
  return bcrypt.hash(value, 10);
}
