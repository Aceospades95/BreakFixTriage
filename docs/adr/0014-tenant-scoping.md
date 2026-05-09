# ADR 0014 — tenant-scoped query helpers

## Status

Accepted. Round-13 §2A (covering §1C, §1D, and the cross-cutting
"single highest-leverage refactor" recommendation from the R13
independent code review).

## Context

The independent code review surfaced a class of leakage that several
prior rounds had quietly accumulated:

- `/api/search` ran `globalSearch()` with no `districtId` predicate.
  Any authenticated user could enumerate tickets, schools, devices,
  and contacts in any district.
- `/api/attachments/[id]` resolved attachments by cuid only — an
  authenticated user with a known id could stream any attachment
  without belonging to the owning district.
- The `/dashboards/*` aggregations and CSV export endpoints carried
  the same shape: "authenticated user" was the gate, not "actor in
  this tenant".

The reviewer's framing — "we have strong memory of past bugs but
weak executable models of current behaviour" — fit. We had grep
gates and regression specs aimed at the lessons we'd learnt; the
lesson we hadn't learnt was that "authenticated" is not the same as
"authorized to read this row".

## Decision

Centralise the actor + tenant scope into a single helper module:

```
src/lib/data/forSession.ts
  ticketWhereForSession(session)
  findTicketForSession(session, idOrIncidentNumber)
  schoolWhereForSession(session)
  deviceWhereForSession(session)
  contactWhereForSession(session)
  routeWhereForSession(session)
  attachmentForSession(session, attachmentId)
  canSeeUserResults(session)
```

Convention:

- ADMIN role returns unrestricted scope (`{}`).
- Non-admin roles return `{ school: { districtId: { in: session.districtIds } } }`
  or the equivalent column-aware shape for each entity.
- A user with empty `districtIds` returns nothing (the `in []`
  predicate matches no rows; this is the correct answer for "user
  not assigned to any district").
- Find helpers return `null` on a cross-tenant miss so callers can
  return **404** (not 403) — 403 leaks the existence of the row to
  a probing attacker; 404 does not.

R13 ships the helpers and converts the highest-leak hot paths:

- `/api/search` — every entity query is scoped; user results
  require the `USERS_MANAGE` permission (see §1C).
- `/api/attachments/[id]` — resolves through the parent entity
  (Ticket / RouteStop / Quote) and applies that entity's tenant
  scope (see §1D).

Remaining hot paths follow in R14:

- CSV export endpoints (tickets, schools, devices)
- `/bench` query
- `/dashboards/*` aggregations
- `/api/exports/*` filter chips
- `/notifications` list
- `/admin/audit` filter chips for non-admin operators (if granted
  the role)

## Alternatives considered

1. **Middleware filter.** Stamp the JWT with district membership
   and have a Prisma extension auto-inject the where clause. The
   reviewer flagged this as a tempting next step, but it raises
   blast-radius questions: a misconfigured extension could silently
   widen scope on a query that was supposed to be admin-only. The
   helper-per-entity pattern is more verbose but keeps the scope
   visible at the call site.

2. **Row-level-security in Postgres.** Push the predicate into the
   database via `CREATE POLICY`. Stronger guarantee but a much
   bigger refactor — the auth context has to flow through Prisma's
   connection pool which currently doesn't carry per-request
   identity. Filed in `docs/round-13-backlog.md` as a future
   consideration.

3. **Inline filters in every handler.** The current state. Easy to
   miss; the reviewer demonstrated several missed sites in §1C/§1D.

## Consequences

- Every caller that resolves rows from these entities must use the
  helpers. We accept the verbosity in exchange for a single audit
  surface ("did this caller use a `*ForSession` helper?").
- A new test (`tests/integration/tenant-scoping.spec.ts`) seeds two
  districts and asserts cross-district enumeration is blocked.
- The R13 hard gate G10 enforces this: every hot list endpoint
  called by a non-admin returns ONLY rows the user's `districtIds`
  permit. CI must include this integration test in the gate.
- 404-not-403 is the documented response for cross-tenant misses;
  reviewers may push back on this for accessibility / debuggability,
  but the leak-prevention argument wins for a public-facing app.

## R14 conversion roadmap

In rough order of risk:

1. CSV export endpoints (already accept role gates; just need the
   tenant scope wired).
2. `/dashboards/*` aggregation queries.
3. `/bench` non-admin walk.
4. `/notifications` list.
5. Long tail: any read query that returns IDs to the client.
