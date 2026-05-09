-- Round-13 §1A + §1I + §1J + §2L — security and audit-schema migration.
--
-- Idempotent on re-run: every column uses IF NOT EXISTS, every index
-- uses IF NOT EXISTS. Safe to apply on a populated production DB.

-- §1A — sessionRevokedBefore on User. JWTs issued before this
-- timestamp are rejected by getSession(). Bumped to now() when
-- adminResetTotpAction or revokeAllSessionsForUser fires.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionRevokedBefore" TIMESTAMP(3);

-- §1I — Portal token hashing migration.
-- For existing plaintext tokens, we cannot recover the originals.
-- After this migration runs the `token` column stores a SHA-256 hash;
-- legacy rows have their plaintext rotated automatically below.
ALTER TABLE "PortalToken"
  ADD COLUMN IF NOT EXISTS "tokenPrefix" TEXT;

ALTER TABLE "PortalToken"
  ADD COLUMN IF NOT EXISTS "dataScope" TEXT NOT NULL DEFAULT 'STANDARD';

-- For rows that have a plaintext token already, populate the prefix
-- (first 8 chars) and rewrite the token to its SHA-256 digest. Uses
-- pgcrypto digest() which is bundled with Postgres ≥ 13.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END$$;

UPDATE "PortalToken"
SET
  "tokenPrefix" = COALESCE("tokenPrefix", LEFT("token", 8)),
  "token" = CASE
    WHEN length("token") = 64
      AND "token" ~ '^[0-9a-f]{64}$'
    THEN "token"  -- already hashed (idempotent on re-run)
    ELSE encode(digest("token", 'sha256'), 'hex')
  END
WHERE "token" IS NOT NULL;

-- Default expiry of 365 days from createdAt for rows that don't
-- have one yet. Documented in ADR 0015.
UPDATE "PortalToken"
SET "expiresAt" = "createdAt" + INTERVAL '365 days'
WHERE "expiresAt" IS NULL;

-- §1J — AuditLog column promotion.
ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "reason" TEXT;

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "transitionType" TEXT;

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "requestId" TEXT;

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "severity" TEXT DEFAULT 'info';

-- Backfill: extract reason and transitionType from the JSON 'after'
-- column on existing rows. Idempotent — checks if column already
-- has a value before overwriting.
UPDATE "AuditLog"
SET
  "reason" = CASE
    WHEN "reason" IS NOT NULL THEN "reason"
    WHEN "after" ? 'reason'
      AND jsonb_typeof("after"->'reason') = 'string'
    THEN "after"->>'reason'
    ELSE NULL
  END,
  "transitionType" = CASE
    WHEN "transitionType" IS NOT NULL THEN "transitionType"
    WHEN "after" ? 'transitionType'
      AND jsonb_typeof("after"->'transitionType') = 'string'
    THEN "after"->>'transitionType'
    ELSE NULL
  END,
  "severity" = COALESCE("severity", 'info')
WHERE "after" IS NOT NULL OR "severity" IS NULL;

CREATE INDEX IF NOT EXISTS "AuditLog_transitionType_idx"
  ON "AuditLog" ("transitionType");

CREATE INDEX IF NOT EXISTS "AuditLog_severity_idx"
  ON "AuditLog" ("severity");

CREATE INDEX IF NOT EXISTS "AuditLog_requestId_idx"
  ON "AuditLog" ("requestId");
