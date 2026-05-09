import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-11 §2F — audit row coverage wave 3.
 *
 * R10 §3C / R11 §2F enumerate the full set of admin mutations
 * that must each write an audit row. The structural assertion
 * proves the writeAudit() callsite exists in source. Live
 * Playwright execution is gated by §2D (CI Postgres).
 */

interface Surface {
  name: string;
  files: string[];
  /** Substrings that MUST appear in at least one of the files. */
  requiredAudits: string[];
}

const SURFACES: Surface[] = [
  {
    name: "Districts CRUD",
    files: ["src/server/actions/admin.ts"],
    requiredAudits: ['entityType: "District"'],
  },
  {
    name: "Schools CRUD",
    files: ["src/server/actions/admin.ts"],
    requiredAudits: ['entityType: "School"'],
  },
  {
    name: "Device models CRUD",
    files: ["src/server/actions/admin.ts"],
    requiredAudits: ['entityType: "DeviceModel"'],
  },
  {
    name: "Holidays CRUD",
    files: ["src/server/actions/holidays.ts"],
    requiredAudits: ['entityType: "Holiday"'],
  },
  {
    name: "Holiday auto-seed (R11 §1D)",
    files: ["src/server/actions/holidays.ts"],
    requiredAudits: ["seedFederalHolidaysAction", "federal-auto-seed"],
  },
  {
    name: "Settings save (R9 §3D)",
    files: ["src/server/actions/settings.ts"],
    requiredAudits: ['entityType: "AppSetting"'],
  },
  {
    name: "Email rules CRUD",
    files: ["src/server/actions/email-admin.ts"],
    requiredAudits: ['entityType: "EmailRule"'],
  },
  {
    name: "Email templates CRUD",
    files: ["src/server/actions/email-admin.ts"],
    requiredAudits: ['entityType: "EmailTemplate"'],
  },
  {
    name: "Password set + reset (R8 §1B)",
    files: ["src/server/actions/admin.ts"],
    requiredAudits: ['action: "reset-password"'],
  },
  {
    name: "Self-change password",
    files: ["src/server/actions/admin.ts"],
    requiredAudits: ['action: "self-change-password"'],
  },
  {
    name: "User CRUD + role/district change",
    files: ["src/server/actions/admin.ts"],
    requiredAudits: ['entityType: "User"', "role:", "district"],
  },
  {
    name: "Permission overrides save",
    files: ["src/server/actions/permissions.ts"],
    requiredAudits: ['action: "permissions:updated"'],
  },
  {
    name: "Schedule block CRUD (Round-7 §3A)",
    files: ["src/server/actions/staff-schedule.ts"],
    requiredAudits: [
      'entityType: "StaffSchedule"',
      'action: "staff.schedule.created"',
      'action: "staff.schedule.deleted"',
    ],
  },
  {
    name: "Routes CRUD",
    files: ["src/lib/scheduling/routes.ts"],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Stop-device add + remove (Round-7 §1A)",
    files: ["src/server/actions/stop-devices.ts"],
    requiredAudits: ["route.stop.device.added", "route.stop.device.removed"],
  },
  {
    name: "Vehicle update (Round-8 §1D)",
    files: ["src/server/actions/scheduling.ts"],
    requiredAudits: ['action: "vehicle.updated"'],
  },
  {
    name: "User session revoke (R10 §1F + R11 §1C)",
    files: ["src/server/actions/2fa.ts"],
    requiredAudits: ['"user.sessions.revoke_all"'],
  },
  {
    name: "Statuses save + reset (R9 §3D)",
    files: ["src/server/actions/statuses.ts"],
    requiredAudits: ['"update"', '"reset"'],
  },
];

describe("Round-11 §2F — audit row coverage wave 3", () => {
  for (const s of SURFACES) {
    it(`${s.name} writes an audit row`, () => {
      const sources = s.files.map((f) => read(f));
      for (const phrase of s.requiredAudits) {
        const found = sources.some((src) => src.includes(phrase));
        expect(
          found,
          `Expected one of [${s.files.join(", ")}] to contain ${JSON.stringify(phrase)}`,
        ).toBe(true);
      }
    });
  }

  // Sanity check: no existing R10 §3C surface lost its writeAudit
  // call during R11 refactors. The R10 file already pins those —
  // this test is the cross-round canary.
  it("R10 audit-wave-2 file still references all 14 surfaces", () => {
    const src = read("tests/round-10/audit-wave-2.test.ts");
    const expected = [
      "Quote lifecycle",
      "Stop-device add/remove",
      "Ticket merge",
      "Stop status transitions",
      "Route cancel + reorder",
      "Vehicle update",
      "Schedule block CRUD",
      "Auth login + failed sign-in",
      "User session revoke",
      "Ticket pick-up",
      "Parts CRUD",
      "Status config save + reset",
      "Email dispatch",
      "Snow import auto-merge",
    ];
    for (const e of expected) expect(src).toContain(e);
  });
});
