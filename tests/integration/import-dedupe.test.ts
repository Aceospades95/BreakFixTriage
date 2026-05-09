import { describe, it } from "vitest";

/**
 * Round-11 §2D — import dedupe integration.
 *
 * Re-importing the same SNOW INC# should not create a second
 * Ticket row; it should land in the merge queue or be silently
 * dropped per Round-7 §3C semantics.
 *
 * Skipped without DATABASE_URL. Full implementation depends on
 * the import-runner being callable from a vitest harness, which
 * is gated by §2D wiring.
 */

describe.skipIf(!process.env.DATABASE_URL)("import dedupe", () => {
  it.todo("re-importing the same INC# doesn't create a duplicate Ticket");
  it.todo("re-importing into a SYN-* row triggers a merge proposal");
  it.todo(
    "re-importing with a changed state advances the existing ticket, not creates a new one",
  );
});
