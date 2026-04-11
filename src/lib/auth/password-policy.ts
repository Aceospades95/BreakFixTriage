/**
 * Password policy.
 *
 * Pure function so every call site (bootstrap, admin reset, self-
 * service change, future signup flow) validates against the same
 * rules. Kept deliberately simple — four requirements, each with a
 * human-readable error message — so the UI can show exactly what the
 * user got wrong.
 *
 * No opinions about character classes beyond "not all one kind". We
 * resist the temptation to require a special character because the
 * NIST guidance since 2017 is that length matters more than
 * composition.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Validate a password against the policy. Returns every violation
 * rather than short-circuiting so the UI can list them all at once.
 */
export function validatePassword(raw: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (typeof raw !== "string") {
    return { ok: false, errors: ["password must be a string"] };
  }
  if (raw.length < MIN_PASSWORD_LENGTH) {
    errors.push(`must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (raw.length > MAX_PASSWORD_LENGTH) {
    errors.push(`must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  if (/^(.)\1+$/.test(raw)) {
    errors.push("cannot be a single repeated character");
  }
  if (COMMON_PASSWORDS.has(raw.toLowerCase())) {
    errors.push("is on the list of obviously-guessable passwords");
  }
  // "Not all one kind" — at least two of lowercase, uppercase, digit,
  // or symbol must be present. This is intentionally weaker than the
  // old NIST "four of four" rule.
  const classes = [
    /[a-z]/.test(raw),
    /[A-Z]/.test(raw),
    /[0-9]/.test(raw),
    /[^a-zA-Z0-9]/.test(raw),
  ].filter(Boolean).length;
  if (classes < 2) {
    errors.push("must mix at least two of: lowercase, uppercase, digit, symbol");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * A tiny set of the most common passwords we never want to see in
 * production. Not meant to replace a real deny list (Pwned Passwords
 * has millions of entries) — just the obvious ones.
 */
const COMMON_PASSWORDS = new Set<string>([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "admin123",
  "administrator",
  "breakfix",
  "breakfix1",
  "changeme",
  "iloveyou",
  "monkey",
  "dragon",
  "abc12345",
  "test1234",
]);

/**
 * Human-readable summary of the policy for display next to password
 * inputs. Kept in sync with `validatePassword` by construction.
 */
export const PASSWORD_POLICY_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, mixing at least two of lowercase, uppercase, digits, or symbols. Not a common or obviously-guessable string.`;
