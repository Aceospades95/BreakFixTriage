import { describe, it, expect } from "vitest";
import { csvFilename, rowsToCsv } from "@/lib/reports/csv-export";

describe("rowsToCsv", () => {
  it("writes a header row followed by data rows", () => {
    const csv = rowsToCsv(
      [{ a: 1, b: "hello" }],
      [
        { header: "A", get: (r) => r.a },
        { header: "B", get: (r) => r.b },
      ],
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("A,B");
    expect(lines[1]).toBe("1,hello");
  });

  it("serializes booleans as literals", () => {
    const csv = rowsToCsv(
      [{ ok: true }, { ok: false }],
      [{ header: "OK", get: (r) => r.ok }],
    );
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("true");
    expect(lines[2]).toBe("false");
  });

  it("formats Date as ISO string", () => {
    const csv = rowsToCsv(
      [{ t: new Date("2026-04-20T12:00:00Z") }],
      [{ header: "T", get: (r) => r.t }],
    );
    expect(csv).toContain("2026-04-20T12:00:00.000Z");
  });

  it("leaves null and undefined cells empty", () => {
    const csv = rowsToCsv(
      [{ a: null as string | null, b: undefined }],
      [
        { header: "A", get: (r) => r.a },
        { header: "B", get: (r) => r.b },
      ],
    );
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe(",");
  });

  it("escapes cells with commas or quotes", () => {
    const csv = rowsToCsv(
      [{ v: 'a, "b"' }],
      [{ header: "V", get: (r) => r.v }],
    );
    expect(csv).toContain('"a, ""b"""');
  });

  it("returns a single-line header when given zero rows", () => {
    const csv = rowsToCsv(
      [],
      [{ header: "A", get: (_r: unknown) => "" }],
    );
    expect(csv).toBe("A\n");
  });

  it("numbers are stringified", () => {
    const csv = rowsToCsv(
      [{ n: 3.14 }],
      [{ header: "N", get: (r) => r.n }],
    );
    expect(csv).toContain("3.14");
  });
});

describe("csvFilename", () => {
  it("appends an ISO date suffix", () => {
    expect(csvFilename("tickets", new Date("2026-04-20T00:00:00Z"))).toBe(
      "tickets-2026-04-20.csv",
    );
  });
  it("zero-pads month and day", () => {
    expect(csvFilename("x", new Date("2026-01-05T00:00:00Z"))).toBe(
      "x-2026-01-05.csv",
    );
  });
});
