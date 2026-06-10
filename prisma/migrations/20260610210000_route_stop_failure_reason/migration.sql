-- Structured failure reason on route stops. The driver's required
-- "why failed" pick was previously only recoverable from the audit
-- log; dispatch needs it on the stop card to triage reschedules.
ALTER TABLE "RouteStop" ADD COLUMN "failureReason" TEXT;
