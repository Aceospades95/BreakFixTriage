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

async function ensureAdminUser() {
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

async function main() {
  await ensureAdminUser();

  // Round-12 §1A — auto-seed defaults on every container start.
  // The R11 path was an opt-in `npm run db:seed:defaults` script
  // that operators forgot to run in production, leaving
  // EmailRule / EmailTemplate / Holiday tables empty. Wiring the
  // call into bootstrap means the seed runs on every deploy.
  // Idempotent: re-running produces no duplicate rows.
  try {
    const { seedDefaults } = await import("./seed-defaults");
    const r = await seedDefaults(prisma);
    console.log(
      `[bootstrap] seed-defaults: templates=${r.templatesUpserted} ruleCreated=${r.ruleCreated} holidaysCreated=${r.holidaysCreated} years=${r.year}-${r.year + 2} audits=${r.auditsWritten}`,
    );
  } catch (err) {
    console.error("[bootstrap] seed-defaults failed:", err);
  }

  // Five-borough expansion — backfill District.region (the borough)
  // from the schools' NYC DBN codes. Every borough filter in the app
  // reads region, and districts created before this work — or by the
  // school importer, which had no borough column to read — have it
  // null, which would make those filters look empty. Idempotent:
  // only fills districts where region IS NULL, never overwrites an
  // operator's value.
  try {
    const { boroughFromDbn } = await import("../src/lib/geo/boroughs");
    const blank = await prisma.district.findMany({
      where: { region: null },
      select: {
        id: true,
        schools: { select: { code: true }, take: 25 },
      },
    });
    let filled = 0;
    for (const d of blank) {
      // Use the most common borough among the district's schools so a
      // single mistyped DBN cannot mislabel a whole district.
      const tally = new Map<string, number>();
      for (const s of d.schools) {
        const b = boroughFromDbn(s.code);
        if (b) tally.set(b, (tally.get(b) ?? 0) + 1);
      }
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!best) continue;
      await prisma.district.update({
        where: { id: d.id },
        data: { region: best[0] },
      });
      filled += 1;
    }
    if (filled > 0) {
      console.log(`[bootstrap] borough backfill: set region on ${filled} district(s)`);
    }
  } catch (err) {
    console.error("[bootstrap] borough backfill failed:", err);
  }

  // Five-borough expansion — trigram indexes for ticket search.
  //
  // The ticket list searches incidentNumber / shortDescription with
  // an unanchored, case-insensitive `contains`, which Postgres can
  // only answer with a sequential scan: measured at 75ms across
  // 40k tickets and growing linearly with every year of citywide
  // history. A GIN trigram index turns that into an index scan.
  //
  // Why here and not a migration: the container starts with
  // `prisma db push`, which syncs the schema and ignores the
  // migrations folder, so raw SQL in a migration would never run in
  // production. Bootstrap already owns this kind of idempotent
  // start-up work. Everything is IF NOT EXISTS and wrapped so a
  // database role without CREATE EXTENSION rights degrades to the
  // old sequential scan instead of blocking the deploy.
  try {
    await prisma.$executeRawUnsafe(
      `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Ticket_incidentNumber_trgm_idx"
         ON "Ticket" USING gin ("incidentNumber" gin_trgm_ops);`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Ticket_shortDescription_trgm_idx"
         ON "Ticket" USING gin ("shortDescription" gin_trgm_ops);`,
    );
    console.log("[bootstrap] search indexes: pg_trgm ready");
  } catch (err) {
    console.warn(
      "[bootstrap] search indexes unavailable (ticket search will use a sequential scan):",
      err instanceof Error ? err.message : err,
    );
  }

  // Round-6 QA audit — self-healing data repair on every container
  // start. The BUG-3 clobbered-approval repair was a manual script
  // that two consecutive deploy rounds forgot to run, so the known
  // corruption survived two "fix confirmed" cycles. The matcher is
  // idempotent (a repaired row no longer matches) and every repair
  // is audited, so running it on every boot is safe and removes the
  // human step entirely.
  try {
    const { findClobberedApprovals, repairClobberedApprovals } =
      await import("../src/lib/quotes/repair");
    const rows = await findClobberedApprovals(prisma);
    if (rows.length > 0) {
      const n = await repairClobberedApprovals(rows, prisma);
      console.log(
        `[bootstrap] quote-repair: restored ${n} clobbered approval(s): ${rows
          .map((r) => r.incidentNumber)
          .join(", ")}`,
      );
    } else {
      console.log("[bootstrap] quote-repair: nothing to repair");
    }
  } catch (err) {
    console.error("[bootstrap] quote-repair failed:", err);
  }
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
