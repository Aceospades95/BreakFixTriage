import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Round-13 — scheduling: stop-device add/remove changes.
 *
 * Three operator-facing improvements:
 *   1. When a device is added to a route stop, the operator can
 *      type a known incident number to attach an existing ticket;
 *      otherwise a synthetic SYN ticket is minted (existing
 *      behaviour). Either way, every StopDevice row carries a
 *      ticketId.
 *   2. Removing a device from a route stop now requires a reason
 *      (min 3 characters). The reason lives in the dedicated
 *      AuditLog.reason column (R13 §1J).
 *   3. Each StopDevice carries a `purpose` (PICKUP | DELIVERY)
 *      so a missed pickup discovered during a delivery (or vice
 *      versa) can be recorded with the right intent.
 */

const root = join(__dirname, "..", "..");
function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Round-13 scheduling — StopDevice schema", () => {
  it("StopDevicePurpose enum exists", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("enum StopDevicePurpose");
    expect(schema).toContain("PICKUP");
    expect(schema).toContain("DELIVERY");
  });

  it("StopDevice.purpose column declared with a default", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(
      /purpose\s+StopDevicePurpose\s+@default\(PICKUP\)/,
    );
  });

  it("Migration adds the column idempotently", () => {
    const sql = read(
      "prisma/migrations/20260509100000_stop_device_purpose/migration.sql",
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS \"purpose\"");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
    expect(sql).toContain("StopDevicePurpose");
  });
});

describe("Round-13 scheduling — addDeviceToStop", () => {
  const src = read("src/server/actions/stop-devices.ts");

  it("schemas accept incidentNumber + purpose", () => {
    expect(src).toContain("incidentNumber: incidentNumberSchema");
    expect(src).toContain("purpose: purposeEnum");
  });

  it("operator-supplied incidentNumber lookup is tenant-scoped", () => {
    expect(src).toContain("if (input.incidentNumber)");
    // The findFirst query carries the schoolId — preventing a
    // cross-tenant typo from attaching a ticket from another
    // district. Source-pin checks the literal `schoolId,` next to
    // an incidentNumber predicate.
    expect(src).toMatch(/where:\s*{\s*schoolId,\s*OR:/);
  });

  it("an unknown ticket number falls back to a synthetic, not a dead end", () => {
    // Round-22 follow-up: the school often creates the SNOW ticket on
    // the spot and it only reaches the app via the next import — so a
    // not-found number mints the synthetic with the number recorded
    // instead of hard-failing (which would strand the device).
    expect(src).toContain("unmatchedIncidentNumber");
    expect(src).toContain("suppliedIncidentNumber");
    expect(src).toContain("awaiting import");
    // A closed ticket is the one hard block — nothing can cascade.
    expect(src).toContain("is closed — reopen it first");
  });

  it("returns incidentNumber + purpose in the result", () => {
    expect(src).toContain("incidentNumber: string");
    expect(src).toContain('purpose:');
    expect(src).toContain("resolvedIncidentNumber: string");
    expect(src).toContain("incidentNumber: resolvedIncidentNumber");
  });

  it("StopDevice create writes the purpose column", () => {
    expect(src).toContain("purpose: finalPurpose");
  });

  it("audit row carries incidentNumber + purpose on the after column", () => {
    expect(src).toContain("incidentNumber: resolvedIncidentNumber,");
    expect(src).toContain("purpose: finalPurpose,");
  });

  it("operator override always wins over job natural type", () => {
    expect(src).toContain(
      "// The operator-supplied override always wins",
    );
    expect(src).toContain(
      "const finalPurpose: StopDevicePurpose = input.purpose",
    );
  });

  it("success toast surfaces ticket number + purpose", () => {
    expect(src).toContain("Device added (");
    expect(src).toContain("verb");
    expect(src).toContain("incidentNumber ?? \"ticket\"");
  });
});

describe("Round-13 scheduling — removeDeviceFromStop", () => {
  const src = read("src/server/actions/stop-devices.ts");

  it("schema requires a reason of at least 3 characters", () => {
    expect(src).toContain('Reason is required (min 3 characters)');
    expect(src).toMatch(/\.min\(3,\s*"Reason is required/);
  });

  it("error redirect lands on the route detail page", () => {
    expect(src).toContain("errorRedirect");
    expect(src).toContain(
      "`/scheduling/routes/${sd.stop.routeId}`",
    );
  });
});

describe("Round-13 scheduling — route detail UI", () => {
  const ui = read(
    "src/app/(app)/scheduling/routes/[routeId]/page.tsx",
  );

  it("device row renders a Pickup/Delivery badge", () => {
    expect(ui).toContain('sd.purpose === "DELIVERY"');
    expect(ui).toContain("Delivery");
    expect(ui).toContain("Pickup");
  });

  it("remove form requires reason via HTML attributes", () => {
    expect(ui).toContain('placeholder="Reason (required)"');
    expect(ui).toContain("required\n");
    expect(ui).toContain("minLength={3}");
  });

  it("add form exposes incidentNumber + purpose inputs", () => {
    expect(ui).toContain('name="incidentNumber"');
    expect(ui).toContain('name="purpose"');
    expect(ui).toContain('"PICKUP"');
    expect(ui).toContain('"DELIVERY"');
  });

  it("add form purpose defaults to the job's natural type", () => {
    expect(ui).toContain("defaultPurpose");
    expect(ui).toContain('stop.job.type === "DELIVERY"');
  });

  it("add form caption explains the new fields in plain language", () => {
    // Round-22 §1C — humanized copy: no "mint a synthetic ticket" /
    // "/duplicates … SNOW incident posts" jargon.
    expect(ui).toContain("a device you find on site");
    expect(ui).toContain("Pickup/Delivery toggle");
    expect(ui).not.toContain("mint a synthetic");
  });
});
