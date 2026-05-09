# ADR 0006 — Audit row includes reason and transition type

**Status:** Accepted (Stage 1 — payload mirroring shipped). **Stage
2 (top-level columns) is gated on maintainer sign-off** because it
adds three columns to `AuditLog` and that is a schema migration.

**Date:** 2026-05-06.

## Context (and the bug it closes)

Findings §3.A2: forcing a ticket transition with reason
"Testing X" leaves an `AuditLog` row whose JSON contains only
`{state}`. The reason is on the `TicketEvent` row, not the audit
row, which means the audit log viewer shows no reason next to a
forced transition.

This matters because the audit log is the single read-side
reviewers use to check who did what. Today the viewer has to
either (a) join `TicketEvent` to `AuditLog` (it doesn't), or (b)
show "—" for the reason column.

The brief asks for three fields to land on every audit row for
every state-transition path:
- `reason` (already passed into `transitionTicket`, dropped on
  the floor by `writeAudit`).
- `actorId` (already on the audit row as `actorUserId`; just
  re-naming the convention).
- `transitionType` — one of `manual`, `forced`, `kanban`,
  `scheduled`, `webhook`. Today this is implicit in the action
  string (`transition:X->Y` vs `transition:force:X->Y`); making
  it an explicit column lets reviewers filter.

## Decision

Two-stage rollout.

### Stage 1 — payload mirror (no schema change, shipped now)

`writeAudit()` accepts an optional `reason` field. When set, the
writer mirrors it into the `after` JSON under
`{ ..., reason, transitionType }`. The audit-log viewer already
reads `after` for its "Before → After" column; a new dedicated
"Reason" column reads `after.reason` directly.

`transitionTicket()` is updated to pass `reason` and a
`transitionType` ("manual" | "forced") through every audit-row
write. The transition engine knows whether `force: true` was set
and stamps `transitionType: "forced"` accordingly.

This mirror is deliberately a JSON field, not a column. It means
the data is searchable via the existing JSON-text filter on
`/admin/audit?action=...` (operators can grep for "Testing X" in
the JSON column), but it is not indexed. For the volume we have
today (one audit row per state transition) that is acceptable.

### Stage 2 — top-level columns (gated)

Add three nullable columns to `AuditLog`:

```prisma
model AuditLog {
  // ... existing fields ...
  reason         String?
  transitionType String?
  // actorUserId already exists (this stays unchanged).
}
```

Migration:
1. Add the columns with `null` defaults.
2. Backfill from `after->>'reason'` and `after->>'transitionType'`
   in a one-shot SQL pass.
3. The audit log viewer reads the dedicated columns instead of
   reaching into JSON.
4. Add an index on `transitionType` so a filter like
   "show me all forced transitions in the last week" is fast.

Backwards compat:
- Old rows whose `reason` field is empty get backfilled from
  `after->>'reason'`. Rows that pre-date the Stage-1 mirror have
  `reason = NULL`; those are documented as "pre-2026-05-06 rows
  may be missing a reason — the original event may still have it
  on the matching `TicketEvent`".

This is a small migration but it is a schema change, so per
§10.rules-of-engagement it does **not** ship from a code PR.

## Consequences

- Stage 1 is a pure code change. Every transition path (manual,
  forced, kanban DnD, scheduled sweep, webhook) writes a `reason`
  and `transitionType` into the audit row's JSON via the writer.
- The audit-log viewer's new "Reason" column reads
  `after.reason` and shows "—" when null.
- The brief's invariant test ("every transition path writes an
  audit row containing reason") becomes
  `tests/audit-row-reason.test.ts` once a real DB is available;
  for now we pin the writer's behaviour with a unit test on
  `writeAudit` directly.
- System-actor null-reason allow-list: scheduled jobs that are
  not state transitions (digest send, cutover export) still
  legitimately have no reason. The allow-list is documented in
  this ADR and enforced by the writer (transitions REQUIRE
  reason; non-transition writes don't).

## Open questions for the maintainer

1. Is `transitionType` the right vocabulary? Other candidates:
   `actorKind` ("user" | "system" | "webhook"), `via`
   ("ui" | "api" | "kanban" | "import"). The brief specifies
   "manual / forced / kanban / scheduled / webhook" so we use that.
2. Should pre-2026-05-06 rows be backfilled with a synthetic
   reason like `"(legacy)"` or stay NULL?

These need answers before Stage 2.
