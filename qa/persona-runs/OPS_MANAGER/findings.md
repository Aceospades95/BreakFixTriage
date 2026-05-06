# OPS_MANAGER — static walkthrough findings

Test user: `ops@breakfix.local` / `breakfix-dev` (`Olivia Ops`).

## Reachable navigation
- `/` — manager view.
- `/tickets`, `/tickets/[id]`, `/tickets/kanban` — full read+write.
- `/bench?scope=all` — read.
- `/scheduling` — full.
- `/quotes` — full read+write (including the **Run hold-window sweep**
  button — see below).
- `/invoices` — read; can mark invoiced.
- `/duplicates` — resolve.
- `/imports`, `/imports/new` — full read+write.
- `/dashboards` — read; sees "Aging > 30d" KPI (bug 4c).

## Issues found

### Run hold-window sweep button does not flip APPROVED quotes (S3)
- **Where:** `src/lib/quotes/sweep.ts::sweepExpiredQuotes`.
- The sweep currently filters
  `where: { status: QuoteStatus.SENT, holdUntil: { lte: now } }`, so a
  quote that was APPROVED but whose `holdUntil` has passed is never
  swept. The ticket-detail UI labels it "(expired)" anyway, which is
  misleading.
- **Fix in this audit branch:** the sweeper now considers any quote in
  status `SENT` **or** `APPROVED` whose `holdUntil` has passed. For
  SENT quotes the existing path stands (→ NO_RESPONSE, ticket goes
  QUOTE_NO_RESPONSE). For APPROVED quotes the same NO_RESPONSE
  semantics apply (the customer has gone silent on a quote we already
  approved on our side — the right legacy-spreadsheet behavior is to
  re-bucket as no-response). The `(expired)` label on ticket detail
  now only appears for SENT/APPROVED quotes (it never applied to
  DECLINED / NO_RESPONSE / CANCELLED quotes anyway, and the label is
  pointless on those statuses).
- **Decision deferred:** whether to introduce a dedicated
  `QUOTE_EXPIRED` ticket sub-state or `EXPIRED` quote status. Filed
  in `docs/proposed-issues.md` per the brief's "do not decide
  unilaterally" rule.

### Aging dashboard off-by-one (S3)
- **Where:** `src/lib/reports/dashboards.ts::agingTickets`.
- A ticket reported on 2026-04-05 was flagged "Aging > 30 days" on
  2026-05-05 (exactly 30 days). The cutoff calculation used a raw
  millisecond subtraction so any sub-day fraction tipped it over.
- **Fix in this audit branch:** centralized in
  `src/lib/reports/sla.ts::isAgingOpenTicket(ticket, now, threshold)`
  using the floor-day rule:
  `floor((now - reportedAt) / DAY) > threshold`. `agingTickets`,
  the dashboard "Aging > 30d" KPI, and the dashboard list now all
  go through this helper. ADR
  `docs/adr/0002-aging-convention.md` documents the rule.

## Not exhaustively tested
- Sending a quote, simulating a customer reply, watching the email
  notification get queued. The sweep + lifecycle code paths are
  covered by `tests/quote-sweep.test.ts`.
- Running an import all the way through commit. Covered by
  `tests/import-mapper.test.ts`.
