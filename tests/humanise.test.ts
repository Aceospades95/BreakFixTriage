import { describe, expect, it } from "vitest";
import {
  humanizeAction,
  humanizeEntity,
  humanizePermission,
  humanizePriority,
  humanizeRole,
  humanizeSource,
  humanizeState,
} from "@/lib/humanise";

/**
 * Round-8 §3D — humanise library entry-point smoke. Each helper
 * is a thin re-export of an existing implementation in lib/format
 * or lib/audit/format. The test confirms the surface is wired
 * and ≥10 cases pass per the brief's §5 hard gate.
 */

describe("Round-8 §3D: humanise library smoke", () => {
  it("humanizeRole sentence-cases the Role enum", () => {
    expect(humanizeRole("OPS_MANAGER")).toBe("Ops manager");
    expect(humanizeRole("READ_ONLY")).toBe("Read only");
    expect(humanizeRole("ADMIN")).toBe("Admin");
  });

  it("humanizeState sentence-cases the TicketState enum", () => {
    expect(humanizeState("PENDING_PICKUP_UNLINKED")).toBe(
      "Pending pickup unlinked",
    );
    expect(humanizeState("MANUFACTURER_RMA")).toBe("Manufacturer RMA");
    expect(humanizeState("ON_HOLD")).toBe("On hold");
  });

  it("humanizePriority sentence-cases the TicketPriority enum", () => {
    expect(humanizePriority("NORMAL")).toBe("Normal");
    expect(humanizePriority("CRITICAL")).toBe("Critical");
  });

  it("humanizeAction renders transition + email + generic action shapes", () => {
    expect(humanizeAction("transition:IMPORTED->TRIAGE")).toBe(
      "Imported → Triage",
    );
    expect(humanizeAction("email:dispatch:sent:ticket_assigned")).toBe(
      "Email sent: ticket assigned",
    );
    expect(humanizeAction("auto-expire")).toBe("Auto-expire");
    expect(humanizeAction("route.stop.device.added")).toBe(
      "Route stop device added",
    );
  });

  it("humanizeSource title-cases TicketSource enum values", () => {
    expect(humanizeSource("ROUTE_PICKUP")).toBe("Route pickup");
    expect(humanizeSource("IMPORTED")).toBe("Imported");
    expect(humanizeSource("MANUAL")).toBe("Manual");
  });

  it("humanizeEntity splits PascalCase into space-separated phrase", () => {
    expect(humanizeEntity("RouteStop")).toBe("Route stop");
    expect(humanizeEntity("StaffSchedule")).toBe("Staff schedule");
    expect(humanizeEntity("PortalToken")).toBe("Portal token");
    expect(humanizeEntity("EmailRule")).toBe("Email rule");
  });

  it("humanizePermission splits group:action into 'Group · Action'", () => {
    expect(humanizePermission("tickets:write")).toBe("Tickets · Write");
    expect(humanizePermission("tickets:read")).toBe("Tickets · Read");
    expect(humanizePermission("tickets:transition")).toBe(
      "Tickets · Transition",
    );
    expect(humanizePermission("scheduling:read")).toBe("Scheduling · Read");
    expect(humanizePermission("routes:build")).toBe("Routes · Build");
    expect(humanizePermission("stops:update")).toBe("Stops · Update");
    expect(humanizePermission("duplicates:resolve")).toBe(
      "Duplicates · Resolve",
    );
    expect(humanizePermission("email:rules_manage")).toBe(
      "Email · Rules manage",
    );
  });

  it("humanizePermission falls back to humaniseEnum for non-standard slugs", () => {
    // No colon — fall through to humaniseEnum.
    expect(humanizePermission("LEGACY_PERM")).toBe("Legacy perm");
  });
});
