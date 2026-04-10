import { describe, it, expect } from "vitest";
import { normalizeServiceNowRow } from "@/lib/import/servicenow";
import { NormalizedImportRow } from "@/lib/import/schema";

describe("normalizeServiceNowRow", () => {
  it("maps a typical SN incident record", () => {
    const mapped = normalizeServiceNowRow({
      number: "INC1234567",
      sys_id: "abc123def456",
      opened_at: "2025-09-01 08:12:00",
      short_description: "Cracked screen",
      description: "Top-right corner shattered",
      priority: "3 - Moderate",
      u_school_code: "11X101",
      location: { display_value: "P.S. 101 Bronx" },
      u_serial_number: "SN-0001",
      u_asset_tag: "AT-0001",
      u_manufacturer: "Acme",
      u_model: "EduBook 14",
      requested_for: { display_value: "Ms. Smith" },
      u_requester_email: "smith@schools.nyc",
    });
    expect(mapped).not.toBeNull();
    const parsed = NormalizedImportRow.safeParse(mapped);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.incidentNumber).toBe("INC1234567");
      expect(parsed.data.serviceNowSysId).toBe("abc123def456");
      expect(parsed.data.shortDescription).toBe("Cracked screen");
      expect(parsed.data.priority).toBe("NORMAL");
      expect(parsed.data.schoolCode).toBe("11X101");
      expect(parsed.data.schoolName).toBe("P.S. 101 Bronx");
      expect(parsed.data.serialNumber).toBe("SN-0001");
      expect(parsed.data.requesterName).toBe("Ms. Smith");
      expect(parsed.data.requesterEmail).toBe("smith@schools.nyc");
    }
  });

  it("drops records missing any required field", () => {
    expect(
      normalizeServiceNowRow({
        number: "INC1",
        short_description: "x",
        opened_at: "2025-01-01",
        // missing u_school_code
      }),
    ).toBeNull();

    expect(
      normalizeServiceNowRow({
        // missing number
        short_description: "x",
        opened_at: "2025-01-01",
        u_school_code: "11X101",
      }),
    ).toBeNull();
  });

  it("falls back to cmdb_ci when u_serial_number is empty", () => {
    const mapped = normalizeServiceNowRow({
      number: "INC2",
      short_description: "battery",
      opened_at: "2025-01-01",
      u_school_code: "11X101",
      cmdb_ci: { display_value: "SN-FALLBACK-42" },
    });
    expect(mapped?.serialNumber).toBe("SN-FALLBACK-42");
  });

  it("maps priority numbers to the canonical enum", () => {
    const row1 = normalizeServiceNowRow({
      number: "INC3",
      short_description: "x",
      opened_at: "2025-01-01",
      u_school_code: "11X101",
      priority: "1",
    });
    const row4 = normalizeServiceNowRow({
      number: "INC4",
      short_description: "x",
      opened_at: "2025-01-01",
      u_school_code: "11X101",
      priority: "4",
    });
    const rowUrgent = normalizeServiceNowRow({
      number: "INC5",
      short_description: "x",
      opened_at: "2025-01-01",
      u_school_code: "11X101",
      priority: "urgent",
    });
    expect(row1?.priority).toBe("URGENT");
    expect(row4?.priority).toBe("LOW");
    expect(rowUrgent?.priority).toBe("URGENT");
  });

  it("defaults priority to NORMAL when unset", () => {
    const row = normalizeServiceNowRow({
      number: "INC6",
      short_description: "x",
      opened_at: "2025-01-01",
      u_school_code: "11X101",
    });
    expect(row?.priority).toBe("NORMAL");
  });

  it("produces rows that pass the Zod schema", () => {
    const mapped = normalizeServiceNowRow({
      number: "INC9999",
      short_description: "Battery swap",
      opened_at: "2025-01-15",
      u_school_code: "11X220",
      u_serial_number: "SN-0002",
    });
    const parsed = NormalizedImportRow.safeParse(mapped);
    expect(parsed.success).toBe(true);
  });
});
