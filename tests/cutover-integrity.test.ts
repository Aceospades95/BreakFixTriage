import { describe, it, expect } from "vitest";
import { buildIntegrityReport } from "@/lib/cutover/integrity";

describe("buildIntegrityReport", () => {
  it("returns an empty report for a clean database", () => {
    const report = buildIntegrityReport({
      tickets: [
        {
          id: "t1",
          incidentNumber: "INC1",
          state: "TRIAGE",
          closedAt: null,
          invoiceRequired: false,
        },
        {
          id: "t2",
          incidentNumber: "INC2",
          state: "CLOSED",
          closedAt: new Date("2025-01-01"),
          invoiceRequired: false,
        },
      ],
      schools: [
        { id: "s1", name: "PS 101", addressId: "a1", hasCoordinates: true },
      ],
      devicesMissingSerial: [],
      orphanQuoteIds: [],
      orphanJobIds: [],
      users: [{ id: "u1", email: "a@b", role: "ADMIN" }],
    });
    expect(report.issues).toEqual([]);
    expect(report.counts.ticket_closed_no_timestamp).toBe(0);
  });

  it("flags CLOSED tickets with a null closedAt", () => {
    const report = buildIntegrityReport({
      tickets: [
        {
          id: "t1",
          incidentNumber: "INC1",
          state: "CLOSED",
          closedAt: null,
          invoiceRequired: false,
        },
      ],
      schools: [],
      devicesMissingSerial: [],
      orphanQuoteIds: [],
      orphanJobIds: [],
      users: [],
    });
    expect(report.counts.ticket_closed_no_timestamp).toBe(1);
    expect(report.issues[0]?.check).toBe("ticket_closed_no_timestamp");
    expect(report.issues[0]?.id).toBe("t1");
  });

  it("flags non-terminal tickets with a closedAt", () => {
    const report = buildIntegrityReport({
      tickets: [
        {
          id: "t1",
          incidentNumber: "INC1",
          state: "IN_REPAIR",
          closedAt: new Date("2025-01-01"),
          invoiceRequired: false,
        },
      ],
      schools: [],
      devicesMissingSerial: [],
      orphanQuoteIds: [],
      orphanJobIds: [],
      users: [],
    });
    expect(report.counts.ticket_closedat_wrong_state).toBe(1);
  });

  it("flags INVOICE_REQUIRED tickets with the flag off", () => {
    const report = buildIntegrityReport({
      tickets: [
        {
          id: "t1",
          incidentNumber: "INC1",
          state: "INVOICE_REQUIRED",
          closedAt: null,
          invoiceRequired: false,
        },
      ],
      schools: [],
      devicesMissingSerial: [],
      orphanQuoteIds: [],
      orphanJobIds: [],
      users: [],
    });
    expect(report.counts.ticket_invoice_required_flag_mismatch).toBe(1);
  });

  it("flags schools without an address and schools without coordinates separately", () => {
    const report = buildIntegrityReport({
      tickets: [],
      schools: [
        { id: "s1", name: "No addr", addressId: null, hasCoordinates: false },
        { id: "s2", name: "No coords", addressId: "a1", hasCoordinates: false },
      ],
      devicesMissingSerial: [],
      orphanQuoteIds: [],
      orphanJobIds: [],
      users: [],
    });
    expect(report.counts.school_missing_address).toBe(1);
    expect(report.counts.school_missing_coordinates).toBe(1);
    expect(report.issues.length).toBe(2);
  });

  it("counts orphan quotes and jobs from the runner output", () => {
    const report = buildIntegrityReport({
      tickets: [],
      schools: [],
      devicesMissingSerial: [],
      orphanQuoteIds: ["q1", "q2"],
      orphanJobIds: ["j1"],
      users: [],
    });
    expect(report.counts.orphan_quote).toBe(2);
    expect(report.counts.orphan_job).toBe(1);
  });

  it("flags devices missing serial numbers", () => {
    const report = buildIntegrityReport({
      tickets: [],
      schools: [],
      devicesMissingSerial: [{ id: "d1" }, { id: "d2" }],
      orphanQuoteIds: [],
      orphanJobIds: [],
      users: [],
    });
    expect(report.counts.device_missing_serial).toBe(2);
  });
});
