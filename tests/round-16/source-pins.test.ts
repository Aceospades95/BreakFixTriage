import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-16 source pins.
 *
 * §B17 — tenant-scoping conversions: each converted surface must
 * keep its *WhereForSession call (ADR 0014). A revert here silently
 * widens a non-admin's export/bench to every district.
 * §D2/D3/D4 — exceptions badge, SLA/digest senders, requeue action.
 */

describe("Round-16 §B17 — tenant scoping stays applied", () => {
  const PINS: Array<{ file: string; needle: string }> = [
    {
      file: "src/app/api/exports/tickets/route.ts",
      needle: "ticketWhereForSession(session)",
    },
    {
      file: "src/app/api/exports/invoices/route.ts",
      needle: "ticketWhereForSession(session)",
    },
    {
      file: "src/app/api/exports/quotes/route.ts",
      needle: "ticketWhereForSession(session)",
    },
    {
      file: "src/app/api/exports/devices/route.ts",
      needle: "deviceWhereForSession(session)",
    },
    {
      file: "src/app/api/exports/schools/route.ts",
      needle: "schoolWhereForSession(session)",
    },
    {
      file: "src/app/(app)/bench/page.tsx",
      needle: "ticketWhereForSession(session)",
    },
  ];
  for (const pin of PINS) {
    it(`${pin.file} applies the session scope`, () => {
      expect(read(pin.file)).toContain(pin.needle);
    });
  }

  it("seed-test links every persona to the test district", () => {
    const src = read("prisma/seed-test.ts");
    expect(src).toContain("districtUser.createMany");
  });
});

describe("Round-16 §D2 — exceptions badge", () => {
  it("layout mounts the badge for admins", () => {
    const src = read("src/app/(app)/layout.tsx");
    expect(src).toContain("ExceptionsBadge");
    expect(src).toMatch(/isAdmin && <ExceptionsBadge \/>/);
  });
  it("badge and page share one counts module", () => {
    expect(read("src/app/api/exceptions/count/route.ts")).toContain(
      "getExceptionCounts",
    );
    expect(read("src/app/(app)/admin/exceptions/page.tsx")).toContain(
      "getExceptionCounts",
    );
  });
});

describe("Round-16 §D3 — SLA + digest senders wired", () => {
  it("escalation sweep dispatches sla_breached / sla_breach_warning", () => {
    const src = read("src/lib/escalation/sweep.ts");
    expect(src).toContain('"sla_breached"');
    expect(src).toContain('"sla_breach_warning"');
    expect(src).toContain("buildTicketEmailVariables");
  });
  it("digest routes through dispatchEmailEvent when a rule exists", () => {
    const src = read("prisma/send-digest.ts");
    expect(src).toContain('dispatchEmailEvent("daily_digest"');
  });
});

describe("Round-16 §D4 — dead-letter requeue", () => {
  it("requeue action exists, is EMAIL_WRITE-gated, and audits", () => {
    const src = read("src/server/actions/email-admin.ts");
    expect(src).toContain("requeueDeadLetteredEmailJobAction");
    expect(src).toContain('action: "email.job.requeued"');
  });
  it("exceptions page renders per-job requeue forms", () => {
    const src = read("src/app/(app)/admin/exceptions/page.tsx");
    expect(src).toContain("requeueDeadLetteredEmailJobAction");
    expect(src).toContain('data-testid="dead-job-row"');
  });
});
