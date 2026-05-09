# ADR 0010 — `PENDING_PICKUP_UNLINKED` for on-route device pickups

**Status:** Accepted (Round-4 §N1).

**Date:** 2026-05-06.

## Context

Field techs occasionally pick up a device on a route that has no
matching SNOW ticket — a school hands them a broken Chromebook
that wasn't logged. Today there's no clean way to capture this:
the tech either has to refuse the pickup ("we'll come back when
SNOW has a ticket") or back-channel the serial to dispatch.

The Round-4 brief commissions an `+ Add device` affordance on the
route stop card with three modes:
1. Search by serial / asset tag for an existing Device.
2. Scan a barcode (reuses existing scan UI).
3. Create a placeholder Device inline (serial required, asset tag
   optional, model + condition).

Each path needs an open Ticket attached so the device flows into
the bench. The Ticket can't be `IMPORTED` (that implies a SNOW
counterpart) and can't be `TRIAGE` (that implies an operator
already routed it). We need a state that says "this came in via
the road and is awaiting reconciliation".

## Decision

### New state: `PENDING_PICKUP_UNLINKED`

- Display name: "Pending pickup (unlinked)".
- Lane: `intake` (visually grouped with IMPORTED / TRIAGE).
- Default SLA: 24h — past that, the dashboard surfaces it as
  "awaiting SNOW match".
- Allowed transitions OUT (manual): `TRIAGE`, `IN_WAREHOUSE`,
  `OUT_OF_SCOPE`, `CLOSED`.
- Allowed transitions IN: **none** in the standard graph. The
  state is reached by the §N1 add-device server action creating
  the ticket directly (see `addDeviceToStop`), or by a SNOW-merge
  proposal accepted in `/duplicates` (see below) which transitions
  the synthetic OUT, not in.

The Round-3 `tests/regression-critical.test.ts` reachability test
is updated to recognise `PENDING_PICKUP_UNLINKED` as a documented
entry-point state alongside `IMPORTED` (a state created directly
by a domain action, not transitioned-to). The brief's "every
state reachable from IMPORTED via DFS" invariant is preserved by
generalising it to "every state reachable from a documented entry
point via DFS".

### New ticket-source enum: `TicketSource`

- Values: `IMPORTED`, `MANUAL`, `PORTAL`, `ROUTE_PICKUP`.
- Stored on `Ticket.source`. Defaults to `IMPORTED` so existing
  rows keep working; the import pipeline + portal + §N1 add-device
  paths all set it explicitly.
- Replaces the Round-2 / Round-3 carry-over of stuffing
  `meta.source` (free-form string) into the JSON blob. The enum
  is queryable + filterable from the dashboard.

### New join model: `StopDevice`

- Fields: `id`, `stopId`, `deviceId`, `ticketId?`, `addedAt`,
  `addedByUserId`, `removedAt?`, `removedByUserId?`, `removedReason?`.
- `ticketId` is nullable for the rare race where a placeholder
  device is added but the synthetic-ticket creation fails — the
  row is reachable via `addedBy` so the operator can resolve from
  `/duplicates`.
- Removal sets `removedAt` and friends; the row stays for audit.
  **Removing a device from a stop does NOT close its ticket** —
  the brief is explicit about this.

### Reconciliation strategy: propose, don't silently merge

`lib/snow-merge.ts::reconcileSnowImport(importBatchId)` runs after
every SNOW import. For each synthetic `PENDING_PICKUP_UNLINKED`
ticket whose `(deviceId, schoolId)` matches a freshly-imported
ticket, it writes a `DuplicateConflict` row (kind: SERIAL) with
the synthetic on the left and the imported on the right.

The operator resolves the proposal in `/duplicates` via the
existing duplicate UI. On accept, the §D merge code path runs
with `copy=all` so on-route artefacts (photos, signatures, time
entries, audit) land on the merged target.

The brief's rule of engagement: **never silently merge SNOW
imports into `PENDING_PICKUP_UNLINKED` tickets.** This module
honours that — it only writes proposals.

## Consequences

- The schema additions (TicketState enum value, TicketSource enum,
  StopDevice model, Ticket.source column) need a `prisma db push`
  on staging before merging.
- The five Round-1 / Round-2 `Record<TicketState, …>` exhaustive
  declarations grow one entry each. Adding the entries was
  mechanical (status-pill lane → "intake", admin/statuses label
  → "Pending pickup (unlinked)", admin/statuses color → "blue",
  default SLA → 1 day, allowed transitions → 4 manual exits).
- The `tests/regression-critical.test.ts` reachability invariant is
  generalised to "documented entry points"; `PENDING_PICKUP_UNLINKED`
  is added to the entry-point list with a comment explaining why.

## Defers

- The `+ Add device` drawer UI on `/scheduling/routes/[id]`. The
  server actions ship today; the form / search / scan tabs are
  the next-largest §N1 surface.
- The yellow "Awaiting SNOW match" ribbon on ticket detail.
- The "Awaiting SNOW match" tile on My Day + bench lane.
- The auto-cancel-stop prompt when the last device is removed.
- All filed in `docs/round-4-qa-checklist.md`.

## Alternatives considered

- **Reuse `IMPORTED` for synthetic pickups.** Rejected — operators
  rely on `IMPORTED` meaning "fresh from SNOW" and the dashboard
  filters use it that way.
- **Auto-merge synthetic into the SNOW ticket on import.** Rejected
  per the brief's explicit rule. Silent merges have lost data
  twice in this codebase's history; the proposal queue is the
  audited reconciliation surface.
- **Make `ROUTE_PICKUP` a Boolean column on Ticket.** Rejected — a
  proper enum allows future sources (`PORTAL` already shipped this
  way) without a column add per source.
