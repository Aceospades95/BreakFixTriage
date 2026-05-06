# ADR 0011 — Staff scheduling: persisted blocks + derived ON_ROUTE

**Status:** Accepted (Round-4 §N2).

**Date:** 2026-05-06.

## Context

Round-4 commissioned a `/scheduling/people` page showing every
active staff member's day with their PTO / OOO / training /
warehouse / meeting blocks alongside their on-route assignments.
A driver's route already lives in the `Route` model; making
operators duplicate that into a schedule blob would invite drift.

The brief's `+ Add block` flow on `/scheduling/people` and the
self-serve `/me/schedule` page need the same backing model.

## Decision

### Schema: `StaffSchedule`

```prisma
enum StaffScheduleKind {
  WAREHOUSE
  ON_ROUTE
  PTO
  TRAINING
  OUT_OF_OFFICE
  MEETING
}

model StaffSchedule {
  id           String            @id @default(cuid())
  userId       String
  date         DateTime          @db.Date
  startMinute  Int                // 0..1440, in user's local tz
  endMinute    Int
  kind         StaffScheduleKind
  note         String?
  routeId      String?            // only when kind = ON_ROUTE
  createdByUserId String
  createdAt    DateTime
  updatedAt    DateTime

  @@unique([userId, date, startMinute])
}
```

The unique key on `(userId, date, startMinute)` blocks the exact-
overlap case at the DB level. Interval overlap detection lives in
`lib/scheduling/people.ts::blocksOverlap` and runs server-side
before insert.

### `ON_ROUTE` blocks are derived, never persisted

The brief is explicit: ON_ROUTE blocks are computed at read time
from `Route` rows whose `assigneeUserId` matches and whose `date`
matches. The `createScheduleBlock` action **rejects**
`kind = ON_ROUTE` with a clear error.

Deriving has two payoffs:
1. The Route row stays the single source of truth; deleting a
   Route automatically removes the schedule block.
2. The route's plannedStart / plannedEnd fields (when added in a
   future migration) drive the block's start/end window without
   a sync hop.

The synthetic-block id is shaped `derived:<routeId>` so the
`/scheduling/people` row renderer can spot derived blocks and
disable the delete affordance — the operator edits the Route, not
the block.

`deriveOnRouteBlocks(date, userIds, fallback, db)` is the
canonical bridge. `getPeopleScheduleForDate` merges persisted
+ derived and sorts by `(userId, startMinute)`.

### RBAC

| Caller                                  | Can write what?                                |
| --------------------------------------- | ---------------------------------------------- |
| ADMIN / OPS_MANAGER / DISPATCHER        | Any user's schedule, any kind except ON_ROUTE  |
| Self (logged-in user, via `/me/schedule`) | Only own schedule, only PTO / OOO / TRAINING |
| Anyone else                             | Read only.                                     |

The server action enforces this with a session-vs-target check;
the form on `/me/schedule` filters its `kind` select to the three
self-serve kinds, but defence-in-depth on the action is the
gate.

### Geo-fence integration: `Stop.arrivedLat`/`Lng`/`At`

The brief mentions surfacing a small map pin on an ON_ROUTE block
when the route's last-arrived stop has a position. Round-4 §C adds
the columns; the `/scheduling/people` rendering reads them through
the same Mapbox helper §C uses for the route detail map.

### Driver availability: `getDriverAvailability(driverId, date, fallback)`

Returns the windows in `[fallback.dayStartMinute,
fallback.dayEndMinute]` where the driver has NO block (persisted
or derived). Used by `/scheduling/build-route` to filter the
driver picker.

The implementation is the standard "subtract busy intervals from
the day window" pass — sorted busy intervals, walking cursor.
Pure function; tested in `tests/staff-schedule.test.ts`.

## Consequences

- `prisma db push` adds the new enum + table + the four
  `Settings.peopleSchedule*` keys (the columns are AppSetting
  rows — same key/value JSON pattern used by Round-2's email
  settings).
- The `/scheduling/people` page renders correctly on a fresh DB
  with zero blocks (empty rows; "no blocks" text). The brief's
  acceptance test #1 expects ON_ROUTE blocks to render from
  Route rows, which works as long as routes exist.

## Defers

- The brief's full Day / Week toggle. Day mode ships today; Week
  mode lands when the §K Calendar primitive ships.
- Mobile collapsed-row layout. The current page uses an HTML
  `<table>` that wraps OK on phone widths; the `min-w-full`
  + horizontal scroll keeps it from breaking, but the brief
  asks for inline kind chips on a phone — that's its own pass.
- The `/scheduling/build-route` driver-picker integration. The
  helper exists; wiring the picker is the next §N2 commit.
- Hour-and-minute pickers + recurrence on `/me/schedule`. Today
  the form takes raw minute counts (0–1440); the brief asks for
  human-shaped inputs.

## Alternatives considered

- **Persist ON_ROUTE blocks** alongside Route. Rejected — drift
  risk when a Route is rescheduled or cancelled.
- **Derive everything from Routes + a separate `Absence` model
  for PTO/OOO.** Rejected — three models for one calendar grid
  was too much; the union under a single `kind` enum is what
  ops actually needs.
- **Persist time as ISO timestamps** instead of `(date,
  startMinute, endMinute)`. Rejected — operators think in
  whole-day grids; the integer-minute representation maps
  cleanly to the calendar UI without a tz round-trip on every
  read.
