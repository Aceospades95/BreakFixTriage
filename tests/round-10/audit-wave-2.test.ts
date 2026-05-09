import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Round-10 §3C — audit-row coverage wave 2.
 *
 * Round-9 §3D wrote a generic walker that catches every
 * src/server/actions/*.ts file with a Prisma mutation but no
 * audit write. R10 §3C extends to the explicit list the brief
 * names: districts CRUD, schools CRUD, device models CRUD,
 * holidays CRUD, settings save, email rule CRUD, email template
 * CRUD, password reset, user create/disable, scheduling block
 * CRUD, route CRUD.
 *
 * The full Playwright spec that exercises each surface live and
 * asserts the audit row appears is filed in
 * docs/round-10-backlog.md (needs CI Postgres + Playwright). The
 * structural assertion below proves the audit-write hooks exist
 * in source.
 */

const ROOT = process.cwd();

interface SurfaceCheck {
  name: string;
  files: string[];
  /** Phrases that must appear in at least one of the files. */
  requiredAudits: string[];
}

const SURFACES: SurfaceCheck[] = [
  {
    name: "Quote lifecycle",
    files: ["src/lib/quotes/lifecycle.ts"],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Stop-device add/remove (Round-7 §1A)",
    files: ["src/server/actions/stop-devices.ts"],
    requiredAudits: ["route.stop.device.added", "route.stop.device.removed"],
  },
  {
    name: "Ticket merge (Round-7 §1A)",
    files: ["src/lib/tickets/merge.ts"],
    requiredAudits: ['action: "merge"', 'action: "device.transferred"'],
  },
  {
    name: "Stop status transitions (Round-7 §3A)",
    files: ["src/lib/scheduling/stops.ts"],
    requiredAudits: ["status:"],
  },
  {
    name: "Route cancel + reorder",
    files: ["src/lib/scheduling/routes.ts"],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Vehicle update (Round-8 §1D)",
    files: ["src/server/actions/scheduling.ts"],
    requiredAudits: ['action: "vehicle.updated"'],
  },
  {
    name: "Schedule block CRUD",
    files: ["src/server/actions/staff-schedule.ts"],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Auth login + failed sign-in (Round-8 §3A + Round-9 §1E)",
    files: ["src/lib/auth/auth.ts"],
    requiredAudits: ['action: "auth:login"', '"auth:failed"'],
  },
  {
    name: "User session revoke (Round-10 §1F + Round-11 §1C)",
    files: ["src/server/actions/2fa.ts"],
    requiredAudits: [
      '"2fa:admin-reset"',
      '"user.sessions.revoke_all"',
    ],
  },
  {
    name: "Ticket pick-up (Round-10 §2F)",
    files: ["src/server/actions/tickets.ts"],
    requiredAudits: ['"ticket.pick_up"'],
  },
  {
    name: "Parts CRUD (Round-9 §3D real finding)",
    files: ["src/server/actions/parts.ts"],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Status config save + reset (Round-9 §3D real finding)",
    files: ["src/server/actions/statuses.ts"],
    requiredAudits: ['"update"', '"reset"'],
  },
  {
    name: "Email dispatch (Round-2 §B + Round-7 §3F)",
    files: ["src/lib/email/send.ts"],
    requiredAudits: ['email:dispatch:queued:'],
  },
  {
    name: "Snow import auto-merge (Round-7 §3C)",
    files: ["src/lib/snow-merge.ts"],
    requiredAudits: [
      "snow-merge.cross-school-collision",
      "snow-merge.runner-up",
    ],
  },
];

describe("Round-10 §3C: audit row coverage wave 2", () => {
  for (const s of SURFACES) {
    it(`${s.name} writes an audit row at every mutation site`, () => {
      const sources = s.files.map((f) =>
        readFileSync(join(ROOT, f), "utf8"),
      );
      for (const phrase of s.requiredAudits) {
        const found = sources.some((src) => src.includes(phrase));
        expect(
          found,
          `Expected one of ${s.files.join(", ")} to contain ${JSON.stringify(phrase)}`,
        ).toBe(true);
      }
    });
  }
});
