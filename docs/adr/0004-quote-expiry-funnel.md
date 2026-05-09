# ADR 0004 — APPROVED-with-expired-hold quotes funnel into NO_RESPONSE

**Status:** Accepted (provisional — see "Decisions deferred" below).

**Date:** 2026-05-06.

## Context (and the bug it closes)

The audit (§4 bug 4b) found that:

- The `isQuoteExpired` predicate filtered to `status === SENT` only.
- The sweep query mirrored that.
- The ticket-detail UI rendered "(expired)" for **any** status whose
  `holdUntil` had passed, including APPROVED.

So an APPROVED quote whose `holdUntil` had passed sat in the
"Approved" tab forever, with the ticket in `QUOTE_APPROVED` and the
detail screen lying about its status.

## Decision

Both `SENT` and `APPROVED` quotes are sweepable. A swept quote goes to
`QuoteStatus.NO_RESPONSE` and the ticket transitions to
`TicketState.QUOTE_NO_RESPONSE`.

- For `QUOTE_SENT → QUOTE_NO_RESPONSE` the edge already exists.
- For `QUOTE_APPROVED → QUOTE_NO_RESPONSE` the edge does **not** exist
  in `ALLOWED_TRANSITIONS`. The sweeper therefore passes
  `force: true` for that case, which writes
  `payload.forced = true` plus `payload.fromState =
  QUOTE_APPROVED` plus `payload.sweep = true` so the override is
  fully traceable in the audit log.

Rationale for funneling into NO_RESPONSE rather than introducing
`QUOTE_EXPIRED`:

1. NO_RESPONSE already means "the quote is stale, the customer hasn't
   acted, ops needs to either re-engage or close the ticket". An
   APPROVED-but-stalled quote has the same operational meaning.
2. A new state would require a Prisma enum migration, an admin UI
   update for the new tab, downstream notification template
   adjustments, and a cutover-compare script change. Out of scope
   for an audit-pass bugfix.
3. The legacy spreadsheet did not have a separate "expired" tab — it
   relied on the same "no response" tab.

## Consequences

- The "Run hold-window sweep" button now does the right thing.
- The dashboards "Quotes expired" KPI now counts SENT *and* APPROVED.
- `tests/quote-sweep.test.ts` was updated to reflect the new contract;
  the prior `it("returns false for non-SENT quotes")` block included
  APPROVED, which encoded the bug. The test now asserts true for
  APPROVED with expired hold and the file header explains why the
  assertion changed.

## Decisions deferred

- Whether to introduce a dedicated `QuoteStatus.EXPIRED` and
  `TicketState.QUOTE_EXPIRED`. Filed as Q1 in
  `docs/proposed-issues.md`. Re-open if ops can't tell apart "school
  approved but PO never followed" from "school never replied".
