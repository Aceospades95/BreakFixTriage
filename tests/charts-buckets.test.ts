import { describe, it, expect } from "vitest";
import { monthBuckets } from "@/lib/charts/buckets";

/**
 * Round-3 §J27 — monthBuckets must emit one bucket per calendar
 * month in the range, including months with zero values (the
 * "Closed tickets last 12 months" chart was missing buckets when
 * a month had no closures).
 */

describe("monthBuckets", () => {
  it("emits 12 ordered buckets covering a 12-month window", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2027-03-31T23:59:59Z");
    const buckets = monthBuckets(from, to, []);
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
  });

  it("counts values into the right bucket", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-06-30T00:00:00Z");
    const buckets = monthBuckets(from, to, [
      new Date("2026-04-15T00:00:00Z"),
      new Date("2026-04-30T23:59:59Z"),
      new Date("2026-05-01T00:00:00Z"),
      new Date("2026-06-01T00:00:00Z"),
    ]);
    expect(buckets.map((b) => [b.key, b.count])).toEqual([
      ["2026-04", 2],
      ["2026-05", 1],
      ["2026-06", 1],
    ]);
  });

  it("includes zero-count months", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-06-30T00:00:00Z");
    const buckets = monthBuckets(from, to, [
      new Date("2026-06-15T12:00:00Z"),
    ]);
    expect(buckets.map((b) => [b.key, b.count])).toEqual([
      ["2026-04", 0],
      ["2026-05", 0],
      ["2026-06", 1],
    ]);
  });

  it("returns labels in the documented form", () => {
    const buckets = monthBuckets(
      new Date("2026-12-01T00:00:00Z"),
      new Date("2027-01-15T00:00:00Z"),
      [],
    );
    expect(buckets.map((b) => b.label)).toEqual(["Dec 2026", "Jan 2027"]);
  });

  it("crosses a year boundary correctly", () => {
    const buckets = monthBuckets(
      new Date("2026-11-01T00:00:00Z"),
      new Date("2027-02-01T00:00:00Z"),
      [],
    );
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("returns [] when from > to", () => {
    expect(
      monthBuckets(
        new Date("2027-01-01T00:00:00Z"),
        new Date("2026-01-01T00:00:00Z"),
        [],
      ),
    ).toEqual([]);
  });

  it("ignores undefined / null values defensively", () => {
    const buckets = monthBuckets(
      new Date("2026-04-01T00:00:00Z"),
      new Date("2026-04-30T00:00:00Z"),
      [undefined as unknown as Date, null as unknown as Date],
    );
    expect(buckets[0]?.count).toBe(0);
  });
});
