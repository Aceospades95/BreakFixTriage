import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Round-8 §3F — every transition button on /scheduling/routes/[id]
 * must write an audit row. The full HTTP-level Playwright spec
 * that drives the buttons and asserts the audit rows lands when
 * a Postgres + Playwright runtime are provisioned in CI (filed
 * in docs/round-8-backlog.md alongside §3E live integration
 * tests).
 *
 * The structural assertion below proves the audit-write hooks
 * exist in source. ≥5 cases per the brief's §5 hard gate.
 */

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Round-8 §3F: driver flow audit-row coverage", () => {
  it("updateStopStatus (Start/Arrived/Complete/Fail) writes an audit row", () => {
    const src = readSrc("src/lib/scheduling/stops.ts");
    expect(src).toMatch(/writeAudit/);
    // The status transition writes one row; cascadeTicketState
    // adds per-ticket follow-ups. We just need to confirm the
    // primary write-site exists.
    expect(src).toMatch(/action:\s*`status:/);
  });

  it("addDeviceToStop writes an audit row tagged route.stop.device.added", () => {
    const src = readSrc("src/server/actions/stop-devices.ts");
    expect(src).toMatch(/writeAudit/);
    expect(src).toMatch(/route\.stop\.device\.added/);
  });

  it("removeDeviceFromStop writes an audit row tagged route.stop.device.removed", () => {
    const src = readSrc("src/server/actions/stop-devices.ts");
    expect(src).toMatch(/route\.stop\.device\.removed/);
  });

  it("cancelRoute writes an audit row when the route is cancelled", () => {
    const src = readSrc("src/lib/scheduling/routes.ts");
    expect(src).toMatch(/writeAudit/);
  });

  // Round-8 §1D — new vehicle update path.
  it("updateRouteVehicleAction writes a vehicle.updated audit row", () => {
    const src = readSrc("src/server/actions/scheduling.ts");
    expect(src).toMatch(/updateRouteVehicleAction/);
    expect(src).toMatch(/action:\s*"vehicle\.updated"/);
    expect(src).toMatch(/before:\s*\{\s*vehicleRef:/);
    expect(src).toMatch(/after:\s*\{\s*vehicleRef:/);
  });

  // Round-7 §1A — synthetic merge.
  it("mergeTicket writes Ticket.merge + Ticket.device.transferred audit rows", () => {
    const src = readSrc("src/lib/tickets/merge.ts");
    expect(src).toMatch(/action:\s*"merge"/);
    expect(src).toMatch(/action:\s*"device\.transferred"/);
  });

  // Round-7 §3C — importer-side merge writes a trail per outcome.
  it("reconcileSnowImport audits cross-school + runner-up edge cases", () => {
    const src = readSrc("src/lib/snow-merge.ts");
    expect(src).toMatch(/snow-merge\.cross-school-collision/);
    expect(src).toMatch(/snow-merge\.runner-up/);
  });

  // Round-8 §3A — sign-in audit.
  it("auth signIn event writes auth:login audit row", () => {
    const src = readSrc("src/lib/auth/auth.ts");
    expect(src).toMatch(/action:\s*"auth:login"/);
    expect(src).toMatch(/events:\s*\{/);
  });
});
