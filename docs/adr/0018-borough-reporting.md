# ADR 0018 — borough filtering and per-borough reporting

## Status

Accepted. Five-borough expansion.

## Context

The pilot ran in one borough, so every list was implicitly "the whole
operation". Across all five there are ~32 community school districts
and ~1,500 schools, and the first question anyone asks — dispatcher,
borough manager, or leadership — is "which borough?".

Two different needs got conflated in the request for "reports per
borough":

1. **Filter** — "how is the Bronx doing", answered by narrowing an
   existing surface.
2. **Comparison** — "how do the five compare, and which one needs
   attention this week", which no filter can answer because a filter
   shows one borough at a time.

Both shipped. The rest of this ADR is about the traps.

## Decision

### Borough lives on `District.region`, and only there

`District.region` is operator-editable free text on purpose (this app
should survive leaving NYC), so filter options are read from the data
and never hardcoded to a list of five. NYC DBN school codes
(`11X123`, third character = borough) provide a **backfill** at
bootstrap, not a second runtime rule.

We deliberately did NOT make the rollup fall back to DBN inference at
read time. `boroughForSchool()` does that and is tested, but if the
report inferred a borough that `ticketWhereForBorough()` could not
filter on, the row count and the list behind it would partition
tickets differently — a number that disagrees with its own
drill-through. One rule, one source: `District.region`, backfilled.

`"NYC"` is treated as a repairable placeholder, not a value. The
original seed shipped it for both the Bronx and Queens districts,
which rendered a single meaningless sixth-borough row. Bootstrap
re-derives those from DBN, and clears them to null (→ the explicit
`Unassigned` bucket) when there is no DBN to infer from. Any other
operator-typed value is left strictly alone.

### Composition, never spread

The tenant scope, the borough filter, and the school-name filter all
own the `school` key of `Prisma.TicketWhereInput`. Spreading them into
one object literal keeps only the last, which in the worst case
**silently drops the tenant scope**. Every call site composes with
`andTicketWhere(...)`. `tests/integration/borough-scoping.test.ts`
proves the naive spread really does leak and that the composer does
not.

### Option lists and non-ticket columns are scoped too

Two scoping holes are easy to miss because the ticket counts look
right:

- The **option list**. A Bronx-scoped user offered all five boroughs
  can pick one they hold nothing in, and the page answers "0
  everything" — which reads as "no work here", not "not yours".
  `boroughOptions(db, session)` narrows to the actor's districts.
- The **district and school columns** on the comparison report are
  not ticket queries, so the ticket scope does not reach them.
  `boroughRollup({ districtIds })` scopes them separately; without it
  a Bronx user saw "Manhattan — 8 districts, 291 schools, 0 open".

### Rows always reconcile

Districts with no region roll into an explicit `Unassigned` row rather
than being dropped, and the footer total is summed from the rows
rather than queried separately. Either shortcut would let the report
be quietly wrong in a way nobody could spot from the page.

### A number must agree with the list it links to

This is the invariant that caught the most bugs, and it is worth
stating as a rule: **do not ship a drill-through link whose
destination contradicts the number that produced it.**

Three existing links violated it:

- `?ageDays=gte:30` — no reader existed. `/tickets` silently ignores
  unknown params, so the aging card linked to *every* open ticket.
- `?state=IMPORTED` — the metric is IMPORTED **and stalled 30+ days**,
  a strict and much smaller subset.
- `?state=CLOSED` — the metric is bounded to the report window; the
  link returned every closure in the system's history.

`src/lib/reports/age-filter.ts` implements `ageDays`, `stateAgeDays`
and `closedSince` and is shared with the metrics, so the two cannot
drift. `e2e/borough-reporting.spec.ts` asserts the counts match
numerically, not that the pages merely render.

### `closedAt` alone does not mean "closed"

`transitionTicket` sets `closedAt` on entry to CLOSED and never clears
it on the way out, and `CLOSED → REOPENED` is a legal transition. Any
closure metric filtering on `closedAt` alone therefore counts reopened
work as both open *and* closed, and folds its first-closure duration
into average turnaround as if it had finished. Every such query now
also requires `state: "CLOSED"` — in the per-borough rollup and in
`closedTicketsByMonth`, which had the identical hole.

### Bounded fan-out, not one wide `Promise.all`

`connection_limit` is 10 for the process. A 7-query fan-out means one
viewer of the report holds 70% of the pool, and what fails when it
runs out is not the report — it is whatever unrelated request is
waiting on a connection. The rollup runs two bounded batches instead.

Two indexes make the queries cheap enough for that to be free:
`Ticket(closedAt)` (every closure-window metric was a seq scan) and
`Ticket(state, stateEnteredAt)` (`slaBreachedWhere` emits 23
`{state, stateEnteredAt}` OR-branches that single-column indexes
cannot serve). Both are declared in `schema.prisma` and repeated
IF NOT EXISTS in bootstrap, with identical shape — production runs
`db push`, so a raw-SQL migration would never execute.

## Consequences

- Adding a reporting surface means adding the borough filter to it;
  `BoroughFilter` + `boroughOptions` + `normalizeBorough` exist so
  every surface behaves identically.
- A page with its own GET form takes the borough as a field **inside**
  that form. Two sibling GET forms each wipe the other's params.
- `/admin/exceptions` deliberately has no borough filter: seven of its
  ten sections (email queue, dead-lettered jobs, audit log, stuck
  imports, orphaned stop devices) have no borough dimension at all,
  and its counts are shared with the topbar badge — a filter applying
  to three sections would make the badge and the page disagree.
- Metrics with no borough dimension say so rather than appearing to
  filter: warehouse inventory value is labelled warehouse-wide, and
  the productivity page notes that routes and stops are counted across
  every borough a person worked, because one route can cross a line.

## Alternatives considered

**Cache the rollup with `unstable_cache`.** Rejected for now: the key
would have to include the tenant scope, and a cache key that is wrong
about tenancy is a cross-tenant data leak. At 40k tickets the report
renders in ~90ms, so there is nothing to buy yet.

**A `Borough` table.** Rejected: `District.region` already exists, is
already editable in the admin UI, and a lookup table would need the
same backfill plus a migration for every non-NYC deployment.
