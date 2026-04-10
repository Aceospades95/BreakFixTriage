import { describe, it, expect } from "vitest";
import { QuoteStatus } from "@prisma/client";
import { isQuoteExpired } from "@/lib/quotes/sweep";

describe("isQuoteExpired", () => {
  const now = new Date("2026-04-10T12:00:00Z");

  it("returns false for non-SENT quotes", () => {
    for (const status of [
      QuoteStatus.DRAFT,
      QuoteStatus.APPROVED,
      QuoteStatus.DECLINED,
      QuoteStatus.NO_RESPONSE,
      QuoteStatus.CANCELLED,
    ]) {
      expect(
        isQuoteExpired(
          {
            status,
            holdUntil: new Date("2025-01-01T00:00:00Z"),
          },
          now,
        ),
      ).toBe(false);
    }
  });

  it("returns false for a SENT quote with no hold window", () => {
    expect(
      isQuoteExpired(
        { status: QuoteStatus.SENT, holdUntil: null },
        now,
      ),
    ).toBe(false);
  });

  it("returns false when the hold window is still in the future", () => {
    expect(
      isQuoteExpired(
        {
          status: QuoteStatus.SENT,
          holdUntil: new Date("2026-04-17T12:00:00Z"),
        },
        now,
      ),
    ).toBe(false);
  });

  it("returns true when the hold window exactly matches now", () => {
    expect(
      isQuoteExpired(
        {
          status: QuoteStatus.SENT,
          holdUntil: new Date("2026-04-10T12:00:00Z"),
        },
        now,
      ),
    ).toBe(true);
  });

  it("returns true when the hold window is in the past", () => {
    expect(
      isQuoteExpired(
        {
          status: QuoteStatus.SENT,
          holdUntil: new Date("2026-04-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe(true);
  });
});
