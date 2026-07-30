import { describe, expect, it } from "vitest";
import {
  boroughForSchool,
  boroughFromDbn,
  districtNumberFromDbn,
  sortBoroughs,
  ticketWhereForBorough,
} from "@/lib/geo/boroughs";

/**
 * Five-borough expansion — the DBN parser is the backfill that makes
 * borough filtering work before every district has had its region
 * typed in by hand, so it has to be strict about what it accepts.
 */

describe("boroughFromDbn", () => {
  it("reads the borough letter out of a real DBN", () => {
    expect(boroughFromDbn("11X123")).toBe("Bronx");
    expect(boroughFromDbn("02M045")).toBe("Manhattan");
    expect(boroughFromDbn("21K256")).toBe("Brooklyn");
    expect(boroughFromDbn("28Q090")).toBe("Queens");
    expect(boroughFromDbn("31R080")).toBe("Staten Island");
  });

  it("is case- and whitespace-tolerant", () => {
    expect(boroughFromDbn(" 11x123 ")).toBe("Bronx");
  });

  it("returns null for anything that isn't DBN-shaped", () => {
    // Non-NYC deployments and legacy codes must simply infer nothing
    // rather than guess a wrong borough.
    expect(boroughFromDbn("IT-SCH-1")).toBeNull();
    expect(boroughFromDbn("SCHOOL-42")).toBeNull();
    expect(boroughFromDbn("11Z123")).toBeNull(); // not a borough letter
    expect(boroughFromDbn("1X123")).toBeNull(); // one district digit
    expect(boroughFromDbn("")).toBeNull();
    expect(boroughFromDbn(null)).toBeNull();
    expect(boroughFromDbn(undefined)).toBeNull();
  });

  it("pulls the district number too", () => {
    expect(districtNumberFromDbn("11X123")).toBe(11);
    expect(districtNumberFromDbn("02M045")).toBe(2);
    expect(districtNumberFromDbn("nope")).toBeNull();
  });
});

describe("boroughForSchool", () => {
  it("prefers the district's typed region over the DBN", () => {
    expect(
      boroughForSchool({ code: "11X123", district: { region: "Bronx North" } }),
    ).toBe("Bronx North");
  });

  it("falls back to the DBN when region is blank or missing", () => {
    expect(boroughForSchool({ code: "11X123", district: { region: "  " } })).toBe(
      "Bronx",
    );
    expect(boroughForSchool({ code: "11X123", district: null })).toBe("Bronx");
    expect(boroughForSchool({ code: "11X123" })).toBe("Bronx");
  });

  it("returns null when neither source knows", () => {
    expect(boroughForSchool({ code: "IT-SCH-1", district: { region: null } })).toBeNull();
  });
});

describe("ticketWhereForBorough", () => {
  it("builds a school→district region filter", () => {
    expect(ticketWhereForBorough("Bronx")).toEqual({
      school: { district: { region: { equals: "Bronx", mode: "insensitive" } } },
    });
  });

  it("is a no-op for blank input so callers can spread it", () => {
    expect(ticketWhereForBorough("")).toEqual({});
    expect(ticketWhereForBorough("   ")).toEqual({});
    expect(ticketWhereForBorough(null)).toEqual({});
    expect(ticketWhereForBorough(undefined)).toEqual({});
  });
});

describe("sortBoroughs", () => {
  it("uses the conventional NYC order, then alphabetical for the rest", () => {
    expect(
      sortBoroughs(["Queens", "Bronx", "Westchester", "Manhattan", "Albany"]),
    ).toEqual(["Manhattan", "Bronx", "Queens", "Albany", "Westchester"]);
  });
});
