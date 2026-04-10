import { describe, it, expect } from "vitest";
import { mapRawRow } from "@/lib/import/mapper";
import { NormalizedImportRow } from "@/lib/import/schema";

describe("import mapper", () => {
  it("maps a typical ServiceNow CSV row with mixed header styles", () => {
    const raw = {
      "Incident Number": "INC1234567",
      "Opened At": "2025-09-01 08:12:00",
      "Short Description": "Cracked screen",
      "Description": "Top-right corner shattered, usable",
      "Priority": "3 - Moderate",
      "DBN": "11X101",
      "Location": "P.S. 101 Bronx",
      "Serial Number": "SN-0001",
      "Asset Tag": "AT-0001",
      "Manufacturer": "Acme",
      "Model": "EduBook 14",
      "Requested For": "Ms. Smith",
      "Email": "smith@schools.nyc",
    };

    const { mapped } = mapRawRow(raw);
    expect(mapped.incidentNumber).toBe("INC1234567");
    expect(mapped.shortDescription).toBe("Cracked screen");
    expect(mapped.longDescription).toBe("Top-right corner shattered, usable");
    expect(mapped.priority).toBe("NORMAL");
    expect(mapped.schoolCode).toBe("11X101");
    expect(mapped.serialNumber).toBe("SN-0001");
    expect(mapped.manufacturer).toBe("Acme");
    expect(mapped.modelName).toBe("EduBook 14");
    expect(mapped.requesterEmail).toBe("smith@schools.nyc");
  });

  it("stashes unknown columns in _extra", () => {
    const { mapped } = mapRawRow({
      "Incident Number": "INC1",
      "Weird Custom Field": "value",
    });
    expect(mapped._extra["Weird Custom Field"]).toBe("value");
  });

  it("normalizes priority numeric codes", () => {
    const { mapped: p1 } = mapRawRow({ Priority: "1" });
    const { mapped: p4 } = mapRawRow({ Priority: "4" });
    expect(p1.priority).toBe("URGENT");
    expect(p4.priority).toBe("LOW");
  });

  it("validates fully-mapped rows against the Zod schema", () => {
    const { mapped } = mapRawRow({
      "incident number": "INC9999",
      "opened at": "2025-01-15",
      "short description": "Battery swap",
      "dbn": "11X220",
      "serial": "SN-0002",
    });
    const parsed = NormalizedImportRow.safeParse(mapped);
    expect(parsed.success).toBe(true);
  });

  it("rejects rows missing required fields", () => {
    const { mapped } = mapRawRow({
      "incident number": "INC5555",
      // no schoolCode, no shortDescription, no reportedAt
    });
    const parsed = NormalizedImportRow.safeParse(mapped);
    expect(parsed.success).toBe(false);
  });

  it("rejects rows with a malformed incident number", () => {
    const { mapped } = mapRawRow({
      "incident number": "not-an-incident",
      "opened at": "2025-01-15",
      "short description": "x",
      "dbn": "11X220",
    });
    const parsed = NormalizedImportRow.safeParse(mapped);
    expect(parsed.success).toBe(false);
  });
});
