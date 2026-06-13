import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Next.js dev mode hot-reloads modules, which would
 * otherwise leak database connections on every reload.
 *
 * Phase-0 reliability hardening (June 2026 incident): a stop update on a
 * live route hung indefinitely and held its row locks until the container
 * was restarted, because nothing at any layer bounded how long a query,
 * lock wait, or idle transaction could live. Every knob below converts
 * "waits forever" into "fails fast with a surfaced error":
 *
 *   - `connection_limit` / `pool_timeout` — explicit pool size and a
 *     bounded wait for a free connection (P2024 instead of queueing
 *     without end when the pool is starved).
 *   - `options` (libpq startup GUCs) —
 *       statement_timeout: no single statement may run > 30s.
 *       lock_timeout: no statement may *wait on a row lock* > 10s. This
 *         is the one that kills the observed failure mode: a second
 *         write against a row whose lock is held by a wedged transaction
 *         errors out instead of hanging the request.
 *       idle_in_transaction_session_timeout: Postgres itself reaps any
 *         transaction that sits open without issuing queries > 60s, so a
 *         leaked transaction can no longer hold locks until a restart.
 *   - `transactionOptions` — explicit interactive-transaction bounds
 *     (Prisma defaults are maxWait 2s / timeout 5s; we widen timeout a
 *     little for multi-row cascades but keep it firmly bounded).
 *
 * Anything already present in DATABASE_URL wins — operators can tune per
 * deployment without a code change. See .env.example for the documented
 * recommended URL.
 */

const DEFAULT_PG_OPTIONS =
  "-c statement_timeout=30000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=60000";

export function hardenDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Unparseable (e.g. a socket path form) — leave untouched.
    return raw;
  }
  const params = url.searchParams;
  if (!params.has("connection_limit")) params.set("connection_limit", "10");
  if (!params.has("pool_timeout")) params.set("pool_timeout", "10");
  if (!params.has("options")) params.set("options", DEFAULT_PG_OPTIONS);
  return url.toString();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildClient(): PrismaClient {
  const hardenedUrl = hardenDatabaseUrl(process.env.DATABASE_URL);
  return new PrismaClient({
    ...(hardenedUrl
      ? { datasources: { db: { url: hardenedUrl } } }
      : {}),
    transactionOptions: {
      maxWait: 5_000,
      timeout: 15_000,
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
