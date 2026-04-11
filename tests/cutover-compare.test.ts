import { describe, it, expect } from "vitest";
import {
  compareLegacyToDb,
  type DbRow,
  type LegacyRow,
} from "@/lib/cutover/compare";

describe("compareLegacyToDb", () => {
  const dbBase: DbRow[] = [
    {
      incidentNumber: "INC1000001",
      state: "IN_WAREHOUSE",
      schoolCode: "11X101",
      serialNumber: "SN-0001",
    },
    {
      incidentNumber: "INC1000002",
      state: "CLOSED",
      schoolCode: "11X220",
      serialNumber: "SN-0002",
    },
  ];

  it("reports a clean match when both sides agree", () => {
    const legacy: LegacyRow[] = [
      {
        incidentNumber: "INC1000001",
        state: "IN_WAREHOUSE",
        schoolCode: "11X101",
        serialNumber: "SN-0001",
      },
      {
        incidentNumber: "INC1000002",
        state: "CLOSED",
      },
    ];
    const report = compareLegacyToDb(legacy, dbBase);
    expect(report.legacyCount).toBe(2);
    expect(report.dbCount).toBe(2);
    expect(report.matched).toBe(2);
    expect(report.onlyInLegacy).toEqual([]);
    expect(report.onlyInDb).toEqual([]);
    expect(report.drift).toEqual([]);
  });

  it("detects incidents only in the sheet", () => {
    const legacy: LegacyRow[] = [
      { incidentNumber: "INC1000001", state: "IN_WAREHOUSE" },
      { incidentNumber: "INC9999999", state: "TRIAGE" },
    ];
    const report = compareLegacyToDb(legacy, dbBase);
    expect(report.onlyInLegacy).toEqual(["INC9999999"]);
  });

  it("detects incidents only in the database", () => {
    const legacy: LegacyRow[] = [
      { incidentNumber: "INC1000001", state: "IN_WAREHOUSE" },
    ];
    const report = compareLegacyToDb(legacy, dbBase);
    expect(report.onlyInDb).toEqual(["INC1000002"]);
  });

  it("flags state drift", () => {
    const legacy: LegacyRow[] = [
      { incidentNumber: "INC1000001", state: "TRIAGE" },
      { incidentNumber: "INC1000002", state: "CLOSED" },
    ];
    const report = compareLegacyToDb(legacy, dbBase);
    expect(report.drift).toEqual([
      {
        incidentNumber: "INC1000001",
        field: "state",
        legacyValue: "TRIAGE",
        dbValue: "IN_WAREHOUSE",
      },
    ]);
  });

  it("flags school code drift and is case-insensitive", () => {
    const legacy: LegacyRow[] = [
      {
        incidentNumber: "INC1000001",
        state: "IN_WAREHOUSE",
        schoolCode: "11X999", // wrong
      },
      {
        incidentNumber: "INC1000002",
        state: "CLOSED",
        schoolCode: "11x220", // same as DB, different case
      },
    ];
    const report = compareLegacyToDb(legacy, dbBase);
    expect(report.drift).toEqual([
      {
        incidentNumber: "INC1000001",
        field: "schoolCode",
        legacyValue: "11X999",
        dbValue: "11X101",
      },
    ]);
  });

  it("ignores missing legacy state (legacy has no opinion)", () => {
    const legacy: LegacyRow[] = [
      { incidentNumber: "INC1000001" },
      { incidentNumber: "INC1000002" },
    ];
    const report = compareLegacyToDb(legacy, dbBase);
    // legacyRow.state is undefined → becomes null → DB state is not null → drift
    expect(report.drift.length).toBe(2);
    for (const d of report.drift) {
      expect(d.field).toBe("state");
      expect(d.legacyValue).toBeNull();
    }
  });

  it("canonicalizes incident numbers to uppercase and trimmed", () => {
    const legacy: LegacyRow[] = [
      { incidentNumber: "  inc1000001 ", state: "IN_WAREHOUSE" },
    ];
    const db: DbRow[] = [
      {
        incidentNumber: "INC1000001",
        state: "IN_WAREHOUSE",
        schoolCode: null,
        serialNumber: null,
      },
    ];
    const report = compareLegacyToDb(legacy, db);
    expect(report.matched).toBe(1);
    expect(report.onlyInDb).toEqual([]);
    expect(report.drift).toEqual([]);
  });
});
