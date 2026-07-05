import { describe, it, expect } from "vitest";
import { QuoteStatus, TicketState } from "@prisma/client";
import { isApprovalConsumed, isQuoteExpired } from "@/lib/quotes/sweep";

/**
 * Bug 4b fix (audit branch claude/breakfix-triage-audit-ZDYuJ):
 *
 * Before the fix, `isQuoteExpired` returned false for APPROVED quotes
 * regardless of `holdUntil`. That mismatched the UI, which already
 * showed "(expired)" once `holdUntil` had passed, and meant an APPROVED
 * quote whose customer never followed through with a PO sat in the
 * Approved tab forever.
 *
 * After the fix, both SENT and APPROVED are sweepable. The two new
 * "APPROVED" cases below previously asserted false; the test was
 * encoding the bug. Updating the assertion is the right move per the
 * audit task's "if a test is wrong, fix the test with a written
 * justification" rule.
 */
describe("isQuoteExpired", () => {
  const now = new Date("2026-04-10T12:00:00Z");

  it("returns false for non-sweepable statuses", () => {
    for (const status of [
      QuoteStatus.DRAFT,
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

  it("returns false for an APPROVED quote with no hold window", () => {
    expect(
      isQuoteExpired(
        { status: QuoteStatus.APPROVED, holdUntil: null },
        now,
      ),
    ).toBe(false);
  });

  it("returns false when the hold window is still in the future (SENT)", () => {
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

  it("returns false when the hold window is still in the future (APPROVED)", () => {
    expect(
      isQuoteExpired(
        {
          status: QuoteStatus.APPROVED,
          holdUntil: new Date("2026-04-17T12:00:00Z"),
        },
        now,
      ),
    ).toBe(false);
  });

  it("returns true when the hold window exactly matches now (SENT)", () => {
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

  it("returns true when the hold window is in the past (SENT)", () => {
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

  // Bug 4b — APPROVED quotes are now sweepable too. See the file
  // header comment for why these assertions changed.
  it("returns true when the hold window exactly matches now (APPROVED)", () => {
    expect(
      isQuoteExpired(
        {
          status: QuoteStatus.APPROVED,
          holdUntil: new Date("2026-04-10T12:00:00Z"),
        },
        now,
      ),
    ).toBe(true);
  });

  it("returns true when the hold window is in the past (APPROVED)", () => {
    expect(
      isQuoteExpired(
        {
          status: QuoteStatus.APPROVED,
          holdUntil: new Date("2026-04-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe(true);
  });
});

/**
 * QA audit (July 2026), BUG-3 — the sweep flipped an APPROVED quote
 * to NO_RESPONSE after its ticket had already used the approval to
 * enter repair, making quote.status contradict the ticket timeline.
 * A consumed approval is off-limits to the sweep; a stalled one
 * (ticket still AT the quote gate) keeps the Bug-4b expiry.
 */
describe("isApprovalConsumed", () => {
  it("APPROVED quote + ticket past the gate = consumed (sweep must skip)", () => {
    for (const state of [
      TicketState.IN_REPAIR,
      TicketState.REPAIR_COMPLETED,
      TicketState.PENDING_DELIVERY,
      TicketState.DELIVERY_SCHEDULED,
      TicketState.CLOSED,
    ]) {
      expect(isApprovalConsumed(QuoteStatus.APPROVED, state)).toBe(true);
    }
  });

  it("APPROVED quote + ticket still in QUOTE_APPROVED = stalled, still sweepable", () => {
    expect(
      isApprovalConsumed(QuoteStatus.APPROVED, TicketState.QUOTE_APPROVED),
    ).toBe(false);
  });

  it("SENT quotes are never 'consumed' — no response is no response", () => {
    expect(isApprovalConsumed(QuoteStatus.SENT, TicketState.IN_REPAIR)).toBe(
      false,
    );
    expect(
      isApprovalConsumed(QuoteStatus.SENT, TicketState.QUOTE_SENT),
    ).toBe(false);
  });
});
