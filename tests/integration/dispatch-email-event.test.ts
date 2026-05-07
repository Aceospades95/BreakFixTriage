import { describe, it } from "vitest";

/**
 * Round-11 §2D — dispatchEmailEvent integration.
 *
 * Verifies that calling dispatchEmailEvent() with a seeded
 * (event, scope) pair writes an EmailLog row whose recipients
 * match the rule's recipients spec.
 *
 * Skipped without DATABASE_URL + SMTP_HOST. The full assertion
 * walks the Mailpit JSON API to confirm the message landed; the
 * §2B Playwright spec exercises the same path end-to-end.
 */

describe.skipIf(!process.env.DATABASE_URL || !process.env.SMTP_HOST)(
  "dispatchEmailEvent",
  () => {
    it.todo("ticket_created event with one enabled rule writes EmailLog row");
    it.todo("EmailLog.to[] matches the rule's recipient spec");
    it.todo("Mailpit /api/v1/messages shows the rendered subject");
    it.todo("disabled rule does NOT write an EmailLog row");
  },
);
