import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Round-13 — security and correctness fixes.
 *
 * Source-pin tests: read the relevant source files and assert that
 * the new R13 fixes are present. These complement the integration
 * tests (which need DATABASE_URL) by guaranteeing the fix doesn't
 * regress at the source level.
 *
 * Each block ties to a §section in the R13 spec.
 */

const root = join(__dirname, "..", "..");
function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Round-13 §1A — session revocation enforcement", () => {
  it("User schema declares sessionRevokedBefore", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("sessionRevokedBefore DateTime?");
  });

  it("getSession() calls isJwtRevoked", () => {
    const src = read("src/lib/auth/session.ts");
    expect(src).toContain("isJwtRevoked");
    expect(src).toContain("session.user.id");
  });

  it("auth.ts stamps iat on JWT", () => {
    const src = read("src/lib/auth/auth.ts");
    expect(src).toContain("token.iat");
    expect(src).toContain("session.user.iat");
  });

  it("revokeAllSessionsForUser bumps sessionRevokedBefore in tx", () => {
    const src = read("src/lib/auth/sessions.ts");
    expect(src).toContain("$transaction");
    expect(src).toContain("sessionRevokedBefore: now");
  });

  it("isJwtRevoked compares iat against cutoff", () => {
    const src = read("src/lib/auth/sessions.ts");
    expect(src).toContain("isJwtRevoked");
    expect(src).toContain("iatSeconds < cutoffSeconds");
  });
});

describe("Round-13 §1B — 2FA reset cascades", () => {
  it("adminResetTotpAction wraps in transaction with session revoke", () => {
    const src = read("src/server/actions/2fa.ts");
    expect(src).toContain("prisma.$transaction");
    expect(src).toContain("sessionRevokedBefore");
    expect(src).toContain("revokedCount");
    expect(src).toContain("twoFactorWasEnrolled");
  });

  it("audit row records cascade fields", () => {
    const src = read("src/server/actions/2fa.ts");
    // Action name preserved for R12 regression — the cascade
    // metadata lands in the structured fields.
    expect(src).toContain('action: "2fa:admin-reset"');
    expect(src).toContain("revokedCount");
  });
});

describe("Round-13 §1C — global search tenant scoping", () => {
  it("globalSearch accepts session and applies scope helpers", () => {
    const src = read("src/lib/search.ts");
    expect(src).toContain("ticketWhereForSession");
    expect(src).toContain("schoolWhereForSession");
    expect(src).toContain("deviceWhereForSession");
    expect(src).toContain("contactWhereForSession");
    expect(src).toContain("canSeeUserResults");
  });

  it("search route passes session to globalSearch", () => {
    const src = read("src/app/api/search/route.ts");
    expect(src).toContain("globalSearch({ query: q, session })");
  });

  it("search results use incidentNumber for ticket hrefs", () => {
    const src = read("src/lib/search.ts");
    expect(src).toContain("/tickets/${t.incidentNumber}");
  });

  it("admin URLs are gated for non-admin actors", () => {
    const src = read("src/lib/search.ts");
    // Round-19 — non-admin branches now land on the tickets list
    // (the old /schools/<id> and /devices/<id> targets never
    // existed and 404'd); admins still get the /admin pages.
    expect(src).toContain("isAdmin ? `/admin/schools/");
    expect(src).toContain("`/admin/devices/${d.id}`");
    expect(src).not.toContain("`/schools/${s.id}`");
    expect(src).not.toContain("`/devices/${d.id}`");
  });
});

describe("Round-13 §1D — attachment IDOR fix", () => {
  it("route handler resolves via attachmentForSession", () => {
    const src = read("src/app/api/attachments/[id]/route.ts");
    expect(src).toContain("attachmentForSession");
    expect(src).not.toContain("prisma.attachment.findUnique");
  });

  it("forSession helper exists and gates by ownership chain", () => {
    const src = read("src/lib/data/forSession.ts");
    expect(src).toContain("attachmentForSession");
    expect(src).toContain("att.ticketId");
    expect(src).toContain("att.routeStopId");
    expect(src).toContain("att.quoteId");
  });

  it("cross-tenant access returns 404 not 403", () => {
    const src = read("src/app/api/attachments/[id]/route.ts");
    // Comment that documents the 404-vs-403 choice.
    expect(src).toContain("404");
    expect(src).toContain("not found");
  });
});

describe("Round-13 §1E — workflow engine reads StatusConfig", () => {
  it("transitionTicket loads config and uses getEffectiveTransitions", () => {
    const src = read("src/lib/workflow/transition.ts");
    expect(src).toContain("getEffectiveTransitions");
    expect(src).toContain("readStatusConfig");
  });

  it("disabled state rejection has explicit error message", () => {
    const src = read("src/lib/workflow/transition.ts");
    expect(src).toContain("config.disabled.includes(to)");
    expect(src).toContain("disabled");
  });

  it("force-change writes severity=warn to audit", () => {
    const src = read("src/lib/workflow/transition.ts");
    expect(src).toContain('severity: opts.force ? "warn" : "info"');
  });
});

describe("Round-13 §1G — dispatchEmailEvent chokepoint", () => {
  it("nodemailer is imported only inside lib/email/providers/", () => {
    const smtpProvider = read("src/lib/email/providers/smtp.ts");
    expect(smtpProvider).toContain("nodemailer");

    // The legacy notifications/smtp.ts no longer imports nodemailer
    const legacy = read("src/lib/notifications/smtp.ts");
    expect(legacy).not.toContain('from "nodemailer"');
    expect(legacy).not.toContain("import('nodemailer')");
    expect(legacy).not.toContain('import("nodemailer")');
  });

  it("legacy SMTP delegates to lib/email/providers/smtp.ts", () => {
    const src = read("src/lib/notifications/smtp.ts");
    expect(src).toContain("@/lib/email/providers/smtp");
    expect(src).toContain("sendViaSmtp");
  });
});

describe("Round-13 §1H — error boundary digest scrubbed", () => {
  it("error boundary renders generic message + support code", () => {
    const src = read("src/app/(app)/error.tsx");
    expect(src).toContain("Something went wrong");
    expect(src).toContain("supportCode");
  });

  it("digest: token is no longer rendered to users", () => {
    const src = read("src/app/(app)/error.tsx");
    expect(src).not.toContain("digest: {error.digest}");
    expect(src).not.toMatch(/>\s*digest:/);
  });

  it("dev-only details block exists for debugging", () => {
    const src = read("src/app/(app)/error.tsx");
    expect(src).toContain("isDevelopment");
    expect(src).toContain("Developer details");
  });
});

describe("Round-13 §1I — portal token hashing", () => {
  it("PortalToken schema has tokenPrefix + dataScope", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("tokenPrefix String?");
    expect(schema).toMatch(/dataScope\s+String/);
  });

  it("createPortalToken hashes the plaintext", () => {
    const src = read("src/lib/portal/tokens.ts");
    expect(src).toContain("hashToken(plaintext)");
    expect(src).toContain("tokenPrefix");
    expect(src).toContain("plaintext: string");
  });

  it("default expiry is 365 days", () => {
    const src = read("src/lib/portal/tokens.ts");
    expect(src).toContain("DEFAULT_TTL_DAYS = 365");
  });

  it("resolvePortalToken hashes the input before lookup", () => {
    const src = read("src/lib/portal/tokens.ts");
    expect(src).toContain("hashToken(rawToken)");
    expect(src).toContain("token: tokenHash");
  });

  it("school admin page renders one-shot token banner", () => {
    const src = read(
      "src/app/(app)/admin/schools/[schoolId]/page.tsx",
    );
    expect(src).toContain("portal-token-once");
    expect(src).toContain("Copy this link now");
    // Apostrophe is JSX-escaped (react/no-unescaped-entities).
    expect(src).toContain("won&apos;t see it again");
  });
});

describe("Round-13 §1J — audit column promotion", () => {
  it("AuditLog schema declares the four new columns", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/reason\s+String\?/);
    expect(schema).toMatch(/transitionType\s+String\?/);
    expect(schema).toMatch(/requestId\s+String\?/);
    expect(schema).toMatch(/severity\s+String\?/);
  });

  it("writeAudit writes to the new columns directly", () => {
    const src = read("src/lib/audit/audit.ts");
    expect(src).toContain("severity: entry.severity ?? \"info\"");
    expect(src).toContain("requestId: entry.requestId ?? null");
    expect(src).toContain("reason: entry.reason ?? null");
  });

  it("AuditEntry interface accepts severity + requestId", () => {
    const src = read("src/lib/audit/audit.ts");
    expect(src).toContain("severity?: AuditSeverity");
    expect(src).toContain("requestId?: string | null");
  });

  it("backfill migration is idempotent on re-run", () => {
    const sql = read(
      "prisma/migrations/20260509000000_round13_security/migration.sql",
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
    expect(sql).toContain("WHEN \"reason\" IS NOT NULL THEN \"reason\"");
  });
});

describe("Round-13 §2A — tenant-scoped query helpers", () => {
  it("forSession.ts exports the documented helpers", () => {
    const src = read("src/lib/data/forSession.ts");
    expect(src).toContain("export function ticketWhereForSession");
    expect(src).toContain("export async function findTicketForSession");
    expect(src).toContain("export function schoolWhereForSession");
    expect(src).toContain("export function deviceWhereForSession");
    expect(src).toContain("export async function attachmentForSession");
    expect(src).toContain("export async function canSeeUserResults");
  });

  it("admin returns unrestricted scope (empty where)", () => {
    const src = read("src/lib/data/forSession.ts");
    expect(src).toContain("if (isAdmin(session)) return {}");
  });
});

describe("Round-13 §2D — global Referrer-Policy", () => {
  it("strict-origin-when-cross-origin is the global default", () => {
    const src = read("next.config.mjs");
    expect(src).toContain("strict-origin-when-cross-origin");
  });

  it("portal routes override to no-referrer", () => {
    const src = read("next.config.mjs");
    expect(src).toContain('source: "/portal/:path*"');
    expect(src).toContain('value: "no-referrer"');
  });
});

describe("Round-13 §2H — health endpoint deploy-readiness", () => {
  it("/api/health surfaces seed counts", () => {
    const src = read("src/app/api/health/route.ts");
    expect(src).toContain("emailRules");
    expect(src).toContain("emailTemplates");
    expect(src).toContain("holidaysCurrentYear");
  });

  it("returns 503 when seed counts below documented minimums", () => {
    const src = read("src/app/api/health/route.ts");
    expect(src).toContain("rules >= 1");
    expect(src).toContain("templates >= 8");
    expect(src).toContain("holidays >= 9");
  });
});
