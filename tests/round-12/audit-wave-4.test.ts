import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Round-12 §3B — audit row coverage wave 4.
 *
 * Round-11 §2F (audit-wave-3) covered the seed inserts. Wave 4
 * sweeps remaining destructive admin actions per the §3B spec:
 *
 *   - Holiday create/edit/delete  → src/server/actions/holidays.ts
 *   - Bulk close                  → src/server/actions/admin.ts (bulkCloseAction)
 *   - Bulk assign                 → src/server/actions/bulk.ts
 *   - Bulk transition             → src/server/actions/bulk.ts
 *   - EmailRule CRUD              → src/server/actions/email-admin.ts
 *   - EmailTemplate CRUD          → src/server/actions/email-admin.ts
 *   - Bench Pick up               → src/server/actions/tickets.ts (pickUpTicketAction)
 *   - Stop reorder                → src/lib/scheduling/routes.ts
 *   - Quote CRUD                  → src/server/actions/quotes.ts
 */

interface Surface {
  name: string;
  files: string[];
  requiredAudits: string[];
}

const SURFACES: Surface[] = [
  {
    name: "Holiday create",
    files: ["src/server/actions/holidays.ts"],
    requiredAudits: ['entityType: "Holiday"', 'action: "create"'],
  },
  {
    name: "Holiday delete",
    files: ["src/server/actions/holidays.ts"],
    requiredAudits: ['action: "delete"'],
  },
  {
    name: "Holiday auto-seed (R11 §1D + R12 §1A)",
    files: ["src/server/actions/holidays.ts"],
    requiredAudits: ["seedFederalHolidaysAction", "federal-auto-seed"],
  },
  {
    name: "Bulk close stale",
    files: ["src/server/actions/maintenance.ts"],
    requiredAudits: ['action: "bulk-close-stale"'],
  },
  {
    name: "Bulk assign + Bulk transition",
    files: ["src/server/actions/bulk.ts"],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Bench pick-up (R10 §2F)",
    files: ["src/server/actions/tickets.ts"],
    requiredAudits: ['"ticket.pick_up"', "pickUpTicketAction"],
  },
  {
    name: "Email rule CRUD",
    files: ["src/server/actions/email-admin.ts"],
    requiredAudits: ['entityType: "EmailRule"'],
  },
  {
    name: "Email template CRUD",
    files: ["src/server/actions/email-admin.ts"],
    requiredAudits: ['entityType: "EmailTemplate"'],
  },
  {
    name: "Stop drag-to-reorder",
    files: ["src/lib/scheduling/routes.ts"],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Quote CRUD (lifecycle + sweep + invoice)",
    files: [
      "src/lib/quotes/lifecycle.ts",
      "src/lib/quotes/sweep.ts",
      "src/lib/quotes/invoice.ts",
    ],
    requiredAudits: ["writeAudit"],
  },
  {
    name: "Settings save (R9 §3D + R12 §2I)",
    files: ["src/server/actions/settings.ts"],
    requiredAudits: ['entityType: "AppSetting"'],
  },
];

describe("Round-12 §3B — audit row coverage wave 4", () => {
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
});
