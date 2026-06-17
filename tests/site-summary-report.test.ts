import { describe, expect, it } from "vitest";
import {
  siteSummaryReportVariables,
  type SiteSummary,
} from "@/lib/reports/site-summary";

/**
 * Round-22 §4 — the report_site email variables mirror the
 * report_operations `{ report: { periodLabel, rangeLabel, lines } }`
 * shape (plus school) so the seeded template renders.
 */

const SUMMARY: SiteSummary = {
  schoolId: "s1",
  schoolName: "P.S. 101 Bronx",
  schoolCode: "X101",
  period: "week",
  from: new Date("2026-06-07T00:00:00Z"),
  to: new Date("2026-06-14T00:00:00Z"),
  openByState: [{ state: "AWAITING_PARTS", count: 3 }],
  devicesPending: 3,
  devicesCompleted: 5,
  routesRun: 2,
  failedStops: [{ reason: "School closed", date: new Date("2026-06-10T00:00:00Z"), sequence: 2 }],
  partialStops: [],
  openExceptions: 1,
  agingOpen: 0,
};

describe("siteSummaryReportVariables", () => {
  it("builds the report.* shape the template needs", () => {
    const v = siteSummaryReportVariables(SUMMARY);
    expect(v.report.school).toBe("P.S. 101 Bronx (X101)");
    expect(v.report.periodLabel).toBe("Weekly");
    expect(v.report.rangeLabel).toBe("2026-06-07 – 2026-06-14");
    // lines is a readable metric block including completed/pending + the
    // failure reason.
    expect(v.report.lines).toContain("Devices completed (returned/closed): 5");
    expect(v.report.lines).toContain("Devices pending (open): 3");
    expect(v.report.lines).toContain("School closed");
  });

  it("month period labels Monthly", () => {
    const v = siteSummaryReportVariables({ ...SUMMARY, period: "month" });
    expect(v.report.periodLabel).toBe("Monthly");
  });

  it("handles a school with no code", () => {
    const v = siteSummaryReportVariables({ ...SUMMARY, schoolCode: null });
    expect(v.report.school).toBe("P.S. 101 Bronx");
  });
});
