/**
 * BreakFix Triage — startup bootstrap.
 *
 * This runs automatically on every container start (see the CMD in
 * Dockerfile). Its job is to ensure the minimum baseline the app needs to
 * function before any user logs in. Today that means exactly one thing:
 * an initial admin user.
 *
 * Everything here MUST be idempotent. Re-running on a populated database
 * should be a no-op.
 *
 * Bootstrap is intentionally separate from `prisma/seed.ts`. Seed creates
 * demo districts, schools, and example tickets for local exploration.
 * Bootstrap only creates the absolute minimum for production use.
 *
 * Self-contained by design: the Docker runner image only copies
 * `prisma/`, not the full `src/` tree, so bootstrap must not import
 * anything from `src/`. The password policy below is duplicated from
 * `src/lib/auth/password-policy.ts` — keep the two in sync.
 */

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Password policy (duplicate of src/lib/auth/password-policy.ts — see note
// above). Kept minimal: bootstrap only needs validatePassword + the minimum
// length constant for its log line.
// ---------------------------------------------------------------------------

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;

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

type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function validatePassword(raw: string): PasswordPolicyResult {
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

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(
      `[bootstrap] ${userCount} user(s) already exist — skipping admin creation.`,
    );
    return;
  }

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@breakfix.local").trim();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? "BreakFix Admin").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!password) {
    console.warn(
      "[bootstrap] No users exist and BOOTSTRAP_ADMIN_PASSWORD is not set. " +
        "Skipping admin creation. Set BOOTSTRAP_ADMIN_PASSWORD in the " +
        "container environment and restart this container to provision " +
        "an initial admin user.",
    );
    return;
  }

  const policyCheck = validatePassword(password);
  if (!policyCheck.ok) {
    console.warn(
      `[bootstrap] BOOTSTRAP_ADMIN_PASSWORD does not satisfy the password policy:\n  - ${policyCheck.errors.join(
        "\n  - ",
      )}\nIt must be at least ${MIN_PASSWORD_LENGTH} characters and mix multiple character classes. Skipping admin creation.`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });
  console.log(`[bootstrap] Created initial admin user: ${admin.email}`);
}

main()
  .catch((err) => {
    // Never crash the container from bootstrap. Log and proceed.
    // The app can still serve read-only traffic without an admin, and
    // schema migrations have already succeeded by the time we reach here.
    console.error("[bootstrap] Failed:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
