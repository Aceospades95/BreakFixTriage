import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  buildFinanceReport,
  buildOperationsReport,
  periodRange,
} from "@/lib/reports/scheduled";
import { weekStartOf } from "@/lib/reports/expenses";

/**
 * Round-20 — scheduled report builders run against the real DB and
 * produce the line blocks the report_operations / report_finance
 * templates interpolate. Counts vary by fixture state; the test
 * pins shape, labels, and that every section renders.
 */

const prisma = new PrismaClient();

describe("periodRange", () => {
  const anchor = new Date("2026-06-10T15:30:00Z");

  it("daily = the previous UTC day", () => {
    const r = periodRange("daily", anchor);
    expect(r.start.toISOString()).toBe("2026-06-09T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(r.periodLabel).toBe("Daily");
  });

  it("weekly = the trailing 7 days", () => {
    const r = periodRange("weekly", anchor);
    expect(r.start.toISOString()).toBe("2026-06-03T00:00:00.000Z");
    expect(r.rangeLabel).toContain("2026-06-03");
  });

  it("monthly = the previous calendar month", () => {
    const r = periodRange("monthly", anchor);
    expect(r.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.rangeLabel).toBe("2026-05");
  });
});

describe("weekStartOf", () => {
  it("snaps to Monday 00:00 UTC", () => {
    // 2026-06-10 is a Wednesday.
    expect(weekStartOf(new Date("2026-06-10T18:00:00Z")).toISOString()).toBe(
      "2026-06-08T00:00:00.000Z",
    );
    // A Monday stays put.
    expect(weekStartOf(new Date("2026-06-08T03:00:00Z")).toISOString()).toBe(
      "2026-06-08T00:00:00.000Z",
    );
    // A Sunday belongs to the week that began the previous Monday.
    expect(weekStartOf(new Date("2026-06-14T23:00:00Z")).toISOString()).toBe(
      "2026-06-08T00:00:00.000Z",
    );
  });
});

describe("report builders (integration)", () => {
  it("operations report renders every section", async () => {
    const { range, lines } = await buildOperationsReport("weekly", prisma);
    expect(range.periodLabel).toBe("Weekly");
    expect(lines).toContain("Tickets opened:");
    expect(lines).toContain("Tickets closed:");
    expect(lines).toContain("Open right now:");
    expect(lines).toContain("Stops completed:");
    expect(lines).toContain("Delays reported:");
  });

  it("finance report renders quotes, POs and expenses", async () => {
    const { lines } = await buildFinanceReport("weekly", prisma);
    expect(lines).toContain("Quotes sent:");
    expect(lines).toContain("Quotes approved:");
    expect(lines).toContain("POs issued:");
    expect(lines).toContain("Tech expenses");
  });

  it("daily finance report uses the window-total expense line", async () => {
    const { lines } = await buildFinanceReport("daily", prisma);
    expect(lines).toContain("Tech expenses:");
  });
});
