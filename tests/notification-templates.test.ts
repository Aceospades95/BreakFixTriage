import { describe, it, expect } from "vitest";
import {
  renderDeliveryScheduled,
  renderPickupScheduled,
  renderQuoteNoResponse,
  renderQuoteSent,
} from "@/lib/notifications/templates";

describe("notification templates", () => {
  describe("renderQuoteSent", () => {
    it("includes the amount when provided", () => {
      const out = renderQuoteSent({
        incidentNumber: "INC1234567",
        schoolName: "P.S. 101 Bronx",
        amountDollars: 199.95,
        diagnosticOnly: false,
        holdUntil: new Date("2026-04-17T00:00:00Z"),
        requesterName: "Ms. Smith",
      });
      expect(out.subject).toContain("INC1234567");
      expect(out.subject).toContain("approval");
      expect(out.body).toContain("Hi Ms. Smith,");
      expect(out.body).toContain("$199.95");
      expect(out.body).toContain("2026-04-17");
      expect(out.body).toContain("P.S. 101 Bronx");
    });

    it("omits the price for diagnostic-only quotes", () => {
      const out = renderQuoteSent({
        incidentNumber: "INC1",
        schoolName: "S",
        amountDollars: null,
        diagnosticOnly: true,
        holdUntil: null,
        requesterName: null,
      });
      expect(out.body).toContain("diagnostic");
      expect(out.body).not.toContain("$");
    });

    it("falls back to a generic greeting when the contact name is missing", () => {
      const out = renderQuoteSent({
        incidentNumber: "INC1",
        schoolName: "S",
        amountDollars: 10,
        diagnosticOnly: false,
        holdUntil: null,
        requesterName: null,
      });
      expect(out.body).toContain("Hello,");
      expect(out.body).not.toContain("Hi null");
    });
  });

  describe("renderDeliveryScheduled", () => {
    it("includes the delivery date in ISO form", () => {
      const out = renderDeliveryScheduled({
        incidentNumber: "INC9",
        schoolName: "Ms 220",
        deliveryDate: new Date("2026-05-02T00:00:00Z"),
        contactName: "Sam Poc",
      });
      expect(out.subject).toContain("delivery");
      expect(out.body).toContain("Hi Sam Poc,");
      expect(out.body).toContain("2026-05-02");
      expect(out.body).toContain("Ms 220");
    });
  });

  describe("renderPickupScheduled", () => {
    it("formats the pickup body correctly", () => {
      const out = renderPickupScheduled({
        incidentNumber: "INC10",
        schoolName: "School X",
        pickupDate: new Date("2026-06-01T00:00:00Z"),
        contactName: null,
      });
      expect(out.subject).toContain("pickup");
      expect(out.body).toContain("Hello,");
      expect(out.body).toContain("2026-06-01");
    });
  });

  describe("renderQuoteNoResponse", () => {
    it("mentions the hold date when present", () => {
      const out = renderQuoteNoResponse({
        incidentNumber: "INC5",
        schoolName: "X",
        holdUntil: new Date("2026-04-03T00:00:00Z"),
      });
      expect(out.subject).toContain("expired");
      expect(out.body).toContain("2026-04-03");
      expect(out.body).toContain("return");
    });

    it("still reads naturally when no hold date is available", () => {
      const out = renderQuoteNoResponse({
        incidentNumber: "INC5",
        schoolName: "X",
        holdUntil: null,
      });
      expect(out.body).not.toContain("null");
      expect(out.body).not.toContain("undefined");
    });
  });
});
