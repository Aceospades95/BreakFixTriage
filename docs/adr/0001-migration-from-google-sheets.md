# ADR 0001 — Migration from Google Sheets to BreakFix Triage

**Status:** Accepted (retroactive — this captures the migration that
already shipped, plus the audit-pass decisions made in
`claude/breakfix-triage-audit-ZDYuJ`).

**Date:** 2026-05-06.

## Context

A NYC DOE break-fix vendor managed device repair lifecycle in a Google
Sheet ("FOR DEVELOPING TRIAGE Copy of NY Triage - Bronx") with a bound
Apps Script project. The sheet grew to:

- 16 tabs per spreadsheet (intake, escalations, pickup, inventory,
  delivery, invoice, manufacturer, printers, reconnects, on-site,
  quotes, warranty extension, out of scope, history, admin, reference).
- Manual row-moves between tabs as the unofficial state machine.
- Apps Script "Custom Tools" menu for duplicate detection,
  highlight/clear, and bulk row moves.
- Conditional formatting to convey SLA / age status.

The replacement (this repo) is a Next.js + Postgres app with an
explicit state machine, real auth, district-scoped multi-tenancy, and
full audit logging.

## Decision

### Legacy → state-machine mapping

Each legacy tab maps to one or more web-app states. The full table is
in `docs/legacy-parity.md`. Highlights:

- Sheet "INVENTORY" tab → six states (`IN_WAREHOUSE`, `DIAGNOSIS`,
  `AWAITING_PARTS`, `PARTS_ORDERED`, `IN_REPAIR`, `REPAIR_COMPLETED`).
- Sheet "QUOTES" tab → five states + `Quote.status`.
- Sheet "HISTORY" tab → `CLOSED` filter + `/audit`.

### How automatic routing lives

The Apps Script "Apply Array Formulas (Q & R) to SNOW STAGING" feature
is replaced by `src/lib/import/pipeline.ts`. New rows from the
ServiceNow staging area are automatically routed `IMPORTED → TRIAGE`
(or to a duplicate-conflict queue) on commit. There is no
"recalculate this column on every cell" pass — every row is
materialized once at import time and then driven by the explicit
state machine.

### How duplicate review is gated

The legacy "Highlight ↦ delete" two-step flow is preserved:

- `DuplicateConflict` rows are created on import with no resolution.
- A human must set `resolution` to one of `MERGE_INTO_LEFT`,
  `MERGE_INTO_RIGHT`, `TREAT_AS_REOPEN`, `KEEP_BOTH`, or `REJECT_NEW`
  before any deletion / merge runs.
- Direct deletion is not exposed in the UI; `merge.ts` runs the
  resolution after a confirmation modal and writes audit rows for both
  sides.

### How quote expiry is modeled (post-audit)

Decision deferred for the QUOTE_EXPIRED / EXPIRED state question (see
`docs/proposed-issues.md` Q1). For now, both `SENT` and `APPROVED`
quotes whose `holdUntil` has passed are swept to
`QuoteStatus.NO_RESPONSE`, with the ticket forced to
`TicketState.QUOTE_NO_RESPONSE`. The audit row records which prior
status the quote was in. See ADR 0004 below.

### How aging is computed (post-audit)

Whole-day, strict-greater-than rule, anchored at `reportedAt`:

    flagged ⇔ floor((now - reportedAt) / DAY) > thresholdDays

See ADR 0002.

### Default hold-window

Minimum 1 day, default 7 (when unset). 0 is rejected by the schema
and the server action validation. See ADR 0003.

## Consequences

- **Positive:** the data model is normalized. Districts, schools,
  contacts, devices are first-class. Audit / event log is mechanical
  and complete. RBAC is real (per-permission, with overrides).
- **Negative:** the legacy sheet's "infinite zoom on a known shape"
  flexibility is gone. Adding a brand-new substate now requires a
  migration (or a careful use of the disabled-state pool — see
  `src/lib/workflow/status-config.ts`).
- **Cutover risk:** mitigated by `prisma/cutover-{export,integrity,
  compare}.ts` plus the `READ_ONLY_MODE` env flag at the edge.

## Decisions deferred

- Q1 (QUOTE_EXPIRED state vs. funnel through NO_RESPONSE).
- Q2 (Warranty extension as ticket state vs. device flag).
- Q3 (Reconnects as device-class filter vs. ticket tag).
- See `docs/proposed-issues.md` for the full list.
