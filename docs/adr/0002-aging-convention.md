# ADR 0002 — Canonical aging / SLA "days elapsed" rule

**Status:** Accepted.

**Date:** 2026-05-06.

## Context (and the bug it closes)

The audit (§4 bug 4c) found that `agingTickets` flagged a ticket
reported on 2026-04-05 as "Aging > 30 days" on 2026-05-05 — exactly
30 calendar days elapsed. The label says "> 30 days", so it should
not flag at exactly 30 days.

Root cause: the cutoff was computed as
`now - 30 days` and the query was `reportedAt < cutoff`. That is a
millisecond comparison, so a sub-day fraction tipped the boundary.

There was no single source of truth for "is this ticket aging?" —
the dashboard, the My Day attention queue, and the bench all had
their own ad-hoc calculations. This ADR pins the rule and the helper.

## Decision

The canonical rule for any "ticket has been in X for too long" check
is, expressed in one line:

    flagged ⇔ floor((now - anchor) / DAY) > thresholdDays

Where:

- `now` is the reference moment (typically `new Date()`);
- `anchor` is `reportedAt` for "has been open too long" or
  `stateEnteredAt` for "has been in this state too long";
- `DAY = 24 * 60 * 60 * 1000` ms (no DST math, no timezone math —
  whole UTC days);
- `thresholdDays` is an integer.

The comparison is **strict greater-than**, on whole-day buckets. A
ticket exactly at the threshold is on the edge but **not** flagged.

The helpers live in `src/lib/reports/sla.ts`:

- `wholeDaysBetween(later, earlier)` — the floor-day diff.
- `daysInState(ticket, now)` — for state-level SLA checks.
- `daysOpen(ticket, now)` — for ticket-level aging (anchored at
  `reportedAt`).
- `isAgingOpenTicket(ticket, now, thresholdDays)` — the "Aging > N"
  predicate, including the `state !== "CLOSED"` gate.

`agingTickets` in `src/lib/reports/dashboards.ts` uses both a DB-side
filter (for performance) and a defensive re-check via
`isAgingOpenTicket` (for correctness at the boundary).

## Why floor and not ceiling

A ceiling would say "any sub-day past N counts as past the threshold"
which lines up with the original bug behavior. Ceiling is harder to
reason about in support: "the ticket is 30 days and 2 hours old"
sounds like 30 days to a human reading the screen.

Floor matches the way humans count tenure ("we've been working on
this for 30 days") and matches the intuitive English rendering of
"> 30 days" — i.e. at least 31.

## Consequences

- Existing call sites that imported `daysInState` are unchanged
  (their semantics already used floor).
- `agingTickets` callers see a one-day shift at the boundary.
  Expected impact: a small number of tickets that were previously
  shown on the "Aging > 30d" panel and shouldn't have been will fall
  off, then come back the next day. No data loss.
- Tests in `tests/aging.test.ts` lock in the boundary cases.

## Alternatives considered

- **Use database `now()` instead of JS `new Date()`.** Rejected —
  the transition timestamps live in the app's clock domain anyway,
  and consistency between the ticket-list filter and the dashboard
  KPI matters more than DB-vs-app clock symmetry.
- **Use calendar days (start-of-day arithmetic) instead of UTC
  millisecond floor.** Rejected — DST-sensitive math is harder to
  test deterministically and the legacy spreadsheet didn't model
  calendar days correctly anyway.
