-- Round-13 — StopDevice.purpose for pickup-vs-delivery on individual lines.
--
-- Idempotent on re-run: enum and column adds use IF NOT EXISTS
-- patterns. Default value is PICKUP because the existing flow was
-- a pickup-only feature; existing rows inherit the natural default.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'StopDevicePurpose'
  ) THEN
    CREATE TYPE "StopDevicePurpose" AS ENUM ('PICKUP', 'DELIVERY');
  END IF;
END$$;

ALTER TABLE "StopDevice"
  ADD COLUMN IF NOT EXISTS "purpose" "StopDevicePurpose" NOT NULL DEFAULT 'PICKUP';

CREATE INDEX IF NOT EXISTS "StopDevice_purpose_idx"
  ON "StopDevice" ("purpose");
