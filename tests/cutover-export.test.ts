import { describe, it, expect } from "vitest";
import {
  csvEscape,
  formatTicketsCsv,
  type ExportTicketRow,
} from "@/lib/cutover/export";

describe("csvEscape", () => {
  it("returns plain strings unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("INC1234567")).toBe("INC1234567");
  });

  it("wraps values containing commas in double quotes", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps values containing newlines", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("passes the empty string through unchanged", () => {
    expect(csvEscape("")).toBe("");
  });
});

describe("formatTicketsCsv", () => {
  const baseRow: ExportTicketRow = {
    incidentNumber: "INC1000001",
    state: "IN_WAREHOUSE",
    priority: "NORMAL",
    reportedAt: new Date("2025-01-15T10:30:00Z"),
    closedAt: null,
    schoolName: "P.S. 101 Bronx",
    schoolCode: "11X101",
    deviceSerial: "SN-0001",
    deviceAssetTag: "AT-0001",
    shortDescription: "Cracked screen",
    invoiceRequired: false,
  };

  it("writes a header row followed by the data", () => {
    const csv = formatTicketsCsv([baseRow]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "incidentNumber,state,priority,reportedAt,closedAt,schoolCode,schoolName,deviceSerial,deviceAssetTag,shortDescription,invoiceRequired",
    );
    expect(lines[1]).toContain("INC1000001");
    expect(lines[1]).toContain("2025-01-15T10:30:00.000Z");
    expect(lines[1]).toContain("IN_WAREHOUSE");
  });

  it("emits an empty closedAt for open tickets", () => {
    const csv = formatTicketsCsv([baseRow]);
    const [, dataRow] = csv.trim().split("\n");
    // closedAt is the fifth column (index 4) — ",," in the middle indicates empty.
    expect(dataRow).toMatch(/,2025-01-15T10:30:00\.000Z,,/);
  });

  it("escapes a school name that contains a comma", () => {
    const csv = formatTicketsCsv([
      {
        ...baseRow,
        schoolName: "P.S. 101, Bronx",
      },
    ]);
    expect(csv).toContain('"P.S. 101, Bronx"');
  });

  it("escapes a description containing a double quote", () => {
    const csv = formatTicketsCsv([
      {
        ...baseRow,
        shortDescription: 'User said "it works sometimes"',
      },
    ]);
    expect(csv).toContain('"User said ""it works sometimes"""');
  });

  it("serializes invoiceRequired as a boolean literal", () => {
    const yes = formatTicketsCsv([{ ...baseRow, invoiceRequired: true }]);
    const no = formatTicketsCsv([{ ...baseRow, invoiceRequired: false }]);
    expect(yes.trim().split("\n")[1]).toMatch(/,true$/);
    expect(no.trim().split("\n")[1]).toMatch(/,false$/);
  });

  it("returns a single header line when given no rows", () => {
    const csv = formatTicketsCsv([]);
    expect(csv.trim().split("\n").length).toBe(1);
  });

  it("ends the output with a trailing newline", () => {
    const csv = formatTicketsCsv([baseRow]);
    expect(csv.endsWith("\n")).toBe(true);
  });
});
