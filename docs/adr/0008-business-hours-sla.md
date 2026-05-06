# ADR 0008 — Business-hours SLA math

**Status:** Accepted (math + Holiday model + settings shipped).
Holiday admin UI is gated, tracked in §19.

**Date:** 2026-05-06.

## Context

Round-2 §22 asks for SLA math that respects business days
(skips weekends + per-district holidays) instead of raw
calendar days. The existing aging math (ADR 0002) uses
floor-day calendar arithmetic; a ticket reported on Friday
and queried Monday counts as 3 days. For a school district
that's effectively 1 working day.

A toggle is needed because (a) some SLA contexts genuinely
want calendar-day windows (manufacturer RMA shipping
timelines), and (b) the cutover from the legacy spreadsheet
expected calendar days, so flipping unilaterally would shift
every breach count.

## Decision

### Math

`businessDaysBetween(later, earlier, config)` walks day-by-day
from `earlier` and counts each day that:

- is not a weekend (configurable; defaults to `[0, 6]` ie.
  Sunday + Saturday)
- is not in `config.holidayDates` (a `Set<string>` of
  `YYYY-MM-DD` UTC date strings the caller pre-fetches once
  per request)

Day-walking is bounded by the threshold the caller cares
about (call sites pass deltas in the range 0..365), so the
cost is a tight loop of integer comparisons. Closed-form
formulas exist but DST + holiday arithmetic in a single
expression is hard to reason about and harder to debug.

`businessDaysOpen(ticket, now, config)` and
`isAgingOpenTicketBH(ticket, now, threshold, config)` are
thin wrappers that mirror the existing `daysOpen` /
`isAgingOpenTicket` API.

### Toggle + defaults

Settings keys (`AppSetting`):

- `sla.businessHours.enabled` — boolean, defaults false. When
  false, every helper collapses to plain whole-day math
  (existing behaviour).
- `sla.businessHours.dayStart` — int 0..23, defaults 9.
- `sla.businessHours.dayEnd` — int 1..24, exclusive, defaults
  17. (Today's math is whole-day so dayStart/dayEnd are not
  consumed yet — they're persisted for a future "hour-level
  SLA" extension that the brief doesn't require.)
- `sla.businessHours.timezone` — IANA tz string, defaults
  `America/New_York`.

Accessor: `getBusinessHours(prisma)` returns a typed
`BusinessHours` object.

### Holiday model

```
model Holiday {
  id        cuid
  date      Date
  label     String
  scope     'GLOBAL' | 'DISTRICT'
  scopeId   String?  // District id when scope=DISTRICT
}
```

Per-district scoping covers NYC DOE's reality: Bronx and Queens
districts share Federal holidays but Bronx has its own
chancellor's day. The caller resolves the holiday set once per
request:

```ts
const districtId = ticket.school.districtId;
const holidays = await prisma.holiday.findMany({
  where: {
    OR: [
      { scope: "GLOBAL" },
      { scope: "DISTRICT", scopeId: districtId },
    ],
    date: { gte: earlierBound, lte: laterBound },
  },
});
const holidayDates = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
```

Holiday admin UI (`/admin/holidays`) is gated — the model +
math are in place but the CRUD page is a follow-up workstream.

### Where it's used

- `lib/reports/sla.ts` exports both calendar-day and
  business-day variants. Existing call sites (ticket SLA badge,
  dashboards "Aging > 30d") continue to use the calendar-day
  helpers; opt-in to business-day mode is per-call so the
  rollout can land in stages.
- A future per-school SLA override (proposed-issues Q9) can
  also opt into business-day mode independently of the
  global setting.

## Consequences

- `tests/sla-business-hours.test.ts` pins boundary cases:
  weekend skip, holiday skip, same-day, negative-diff, CLOSED
  gate.
- A migration is required (Prisma schema added Holiday model
  + the four new settings keys).
- The legacy aging math (ADR 0002) is unchanged. The new math
  is opt-in.

## Defers

- Hour-level SLA (using `dayStart` / `dayEnd`).
- `/admin/holidays` CRUD.
- Per-school SLA overrides (proposed-issues Q9).
