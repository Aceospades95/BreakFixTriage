# Round-16 backlog

Filed during R16 — to ship in R17 or later. D1-D5 and the
tractable half of B17 graduated this round; B5/B6 closed as
already-shipped.

## Carried forward

- **B13** — audit string normalisation. Still the standing
  candidate for a dedicated round (sweep + historical migration).
  R16 added two more dotted actions (`email.job.requeued` follows
  the convention; `escalate` and `transition:*` still don't).
- **B20-B31 (R13 list)** — unchanged where not graduated.
- **C2-C5 (R14 list)** — unchanged.

## New in R16

- **E1 — dashboards tenant scoping.** The B17 remainder. The four
  dashboard pages and /my-day read through shared `lib/reports/*`
  helpers (digest, sla, charts); scoping them means threading
  `BreakFixSession` through that layer and deciding what an
  "all districts" admin rollup should show a district-scoped
  manager. Needs its own pass with report-level tests.
- **E2 — badge push, not poll.** The exceptions badge polls every
  5 minutes; the events bus (`lib/events/bus.ts`) already exists
  for tickets-changed SSE. Wiring exception deltas onto it would
  make the badge live.
- **E3 — requeue-all affordance.** D4 ships per-job requeue;
  a bulk "requeue all dead-lettered" with a single summary audit
  row (requestId grouping per ADR 0006) is the obvious next step.
- **E4 — digest rule seeding.** The daily_digest path activates
  only when an admin creates an enabled rule; consider seeding a
  disabled example rule (like ticket_created) so the affordance is
  discoverable from /admin/email-rules.
- **E5 — SLA email dedupe window.** The sweep's idempotency is
  day-scoped via `meta.lastEscalatedAt`, which now also gates the
  emails — one email per ticket per day maximum. If ops wants a
  longer email cadence than in-app cadence, split the stamps.
