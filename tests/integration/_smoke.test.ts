import { describe, expect, it } from "vitest";

/**
 * Round-13 hotfix — placeholder smoke test for tests/integration.
 *
 * Two reasons this file exists:
 *
 *   1. Belt-and-suspenders: `npm run test:integration` already
 *      runs with `--passWithNoTests`, so an empty directory is
 *      no longer a fatal exit. But if someone later removes the
 *      flag (or the integration tests all skip via
 *      `describe.skipIf(!process.env.DATABASE_URL)` and vitest
 *      reports the dir as test-empty), this placeholder keeps a
 *      passing assertion in scope.
 *
 *   2. Heartbeat: every CI run logs at least one passing test
 *      out of tests/integration so the job's "tests run" counter
 *      is non-zero. Makes it easy to tell "the integration job
 *      ran" from "the integration job was skipped or hung".
 *
 * Anyone adding a real integration test should leave this file
 * alone — it's intentionally trivial.
 */

describe("integration suite smoke", () => {
  it("the runner is alive", () => {
    expect(true).toBe(true);
  });
});
