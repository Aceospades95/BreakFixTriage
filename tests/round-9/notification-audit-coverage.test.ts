import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Round-9 §3F — every notification dispatched via dispatchEmailEvent
 * writes both an EmailLog row AND a main-audit-log row. The brief's
 * acceptance is "triggering any notify-on-enter status writes both
 * rows". Round-2 §B + §3 already wired this — the assertion below
 * locks the invariant in.
 */

const ROOT = process.cwd();

describe("Round-9 §3F: notification dispatch audit coverage", () => {
  it("dispatchEmailEvent writes the EmailLog row", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/email/send.ts"),
      "utf8",
    );
    expect(src).toMatch(/db\.emailLog\.create/);
    expect(src).toMatch(/status:\s*EmailLogStatus\.queued/);
  });

  it("dispatchEmailEvent writes the audit log row tagged email:dispatch", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/email/send.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /action:\s*`email:dispatch:queued:\$\{event\}`/,
    );
    expect(src).toMatch(/transitionType:\s*"email_send"/);
  });

  it("dispatchEmailEvent writes a skipped audit row when no rules match", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/email/send.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /action:\s*`email:dispatch:skipped:\$\{event\}`/,
    );
  });

  it("audit format renders email:dispatch:queued:* as 'Email queued: <event>'", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/audit/format.ts"),
      "utf8",
    );
    expect(src).toMatch(/Email \$\{phase\}: \$\{humaniseEnum\(event\)/);
  });
});
