import { describe, it, expect } from "vitest";
import { StaffScheduleKind } from "@prisma/client";
import {
  blocksOverlap,
  getDriverAvailability,
} from "@/lib/scheduling/people";

/**
 * Round-4 §N2 — StaffSchedule helpers.
 *
 * `blocksOverlap` is the pure overlap detector that the create-block
 * server action uses to reject impossible writes. `getDriverAvailability`
 * needs a Prisma mock — we use a tiny in-memory shim.
 */

describe("blocksOverlap", () => {
  const date = new Date("2026-05-06T00:00:00Z");

  it("identical intervals overlap", () => {
    expect(
      blocksOverlap(
        { userId: "u", date, startMinute: 540, endMinute: 1020 },
        { userId: "u", date, startMinute: 540, endMinute: 1020 },
      ),
    ).toBe(true);
  });

  it("partial overlap (b starts inside a)", () => {
    expect(
      blocksOverlap(
        { userId: "u", date, startMinute: 540, endMinute: 720 },
        { userId: "u", date, startMinute: 600, endMinute: 800 },
      ),
    ).toBe(true);
  });

  it("touching intervals do NOT overlap (a ends exactly when b starts)", () => {
    expect(
      blocksOverlap(
        { userId: "u", date, startMinute: 540, endMinute: 600 },
        { userId: "u", date, startMinute: 600, endMinute: 660 },
      ),
    ).toBe(false);
  });

  it("non-overlapping intervals", () => {
    expect(
      blocksOverlap(
        { userId: "u", date, startMinute: 540, endMinute: 600 },
        { userId: "u", date, startMinute: 700, endMinute: 800 },
      ),
    ).toBe(false);
  });

  it("different users never overlap", () => {
    expect(
      blocksOverlap(
        { userId: "u1", date, startMinute: 540, endMinute: 1020 },
        { userId: "u2", date, startMinute: 540, endMinute: 1020 },
      ),
    ).toBe(false);
  });

  it("different days never overlap", () => {
    const d2 = new Date("2026-05-07T00:00:00Z");
    expect(
      blocksOverlap(
        { userId: "u", date, startMinute: 540, endMinute: 1020 },
        { userId: "u", date: d2, startMinute: 540, endMinute: 1020 },
      ),
    ).toBe(false);
  });
});

describe("getDriverAvailability", () => {
  const date = new Date("2026-05-06T00:00:00Z");
  const fallback = { dayStartMinute: 8 * 60, dayEndMinute: 18 * 60 };

  function makeDb(persisted: unknown[], routes: unknown[]) {
    return {
      staffSchedule: {
        findMany: async () => persisted,
      },
      route: {
        findMany: async () => routes,
      },
    } as unknown as Parameters<typeof getDriverAvailability>[3];
  }

  it("free all day → one window 8a–6p", async () => {
    const out = await getDriverAvailability(
      "u",
      date,
      fallback,
      makeDb([], []),
    );
    expect(out).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });

  it("PTO 1pm–6pm splits availability", async () => {
    const out = await getDriverAvailability(
      "u",
      date,
      fallback,
      makeDb(
        [
          {
            id: "s1",
            userId: "u",
            date,
            startMinute: 13 * 60,
            endMinute: 18 * 60,
            kind: StaffScheduleKind.PTO,
            note: null,
            routeId: null,
            createdByUserId: "x",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [],
      ),
    );
    expect(out).toEqual([{ startMinute: 480, endMinute: 780 }]);
  });

  it("derived ON_ROUTE block subtracts the day window", async () => {
    const out = await getDriverAvailability(
      "u",
      date,
      fallback,
      makeDb([], [
        // Route with date matching → derived ON_ROUTE block
        // spans dayStart..dayEnd by default.
        { id: "r1", assigneeUserId: "u", date },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("a block fully outside the day window is ignored", async () => {
    const out = await getDriverAvailability(
      "u",
      date,
      fallback,
      makeDb(
        [
          {
            id: "s1",
            userId: "u",
            date,
            startMinute: 0,
            endMinute: 7 * 60, // 12am-7am, before the day starts
            kind: StaffScheduleKind.OUT_OF_OFFICE,
            note: null,
            routeId: null,
            createdByUserId: "x",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [],
      ),
    );
    expect(out).toEqual([{ startMinute: 480, endMinute: 1080 }]);
  });
});
