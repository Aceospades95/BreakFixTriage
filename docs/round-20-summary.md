# Round-20 summary

Theme: the NY team's field-feedback batch — eleven asks, all
shipped, all e2e-tested. One schema migration
(`20260610173952_round20_field_ops`) carries the new tables/columns.

## Shipped

### 1. "We should have to select what we are picking up"
Stop completion now REQUIRES it server-side. Each device line in
the completion panel is a real `confirmedDeviceIds` form field;
`updateStopStatusAction` refuses COMPLETED while any active line is
unconfirmed (error banner names the unconfirmed devices) and stamps
`StopDevice.confirmedAt/confirmedByUserId` — the durable field
check-off (closes R18 backlog F1). Driver persona spec asserts the
stamps.

### 2. Scheduled-visit emails to SPOCs
New `pickup_scheduled` event mirrors `delivery_scheduled`; building
a route now dispatches one or the other per ticket on every stop.
Starter (disabled) GLOBAL rules seeded for both with SPOC
recipients. **Bug fixed while here:** the seeded `ticket_created`
rule used recipient kind `school_spoc`, which fails validation —
enabling it silently skipped every send. Seed now writes `spoc` and
repairs existing rows.

### 3. Delay reporting → schedule + SPOC email
"Running late? Report a delay" on every active stop: reason
(Construction / Weather / Vehicle emergency / Previous stop delay /
Other), minutes, note. Records on the stop (amber chip + timing
line), pushes `arrivalEstimate`, audits, and fires the new
`stop_delayed` event to the SPOC per ticket. The ok-banner says
whether a mail actually went out or the rule is still disabled.

### 4. Tech expenses (bus fare receipts)
New `Expense` model + `/me/expenses` (submit date/kind/amount/
description, pin to one of your own recent routes, attach the
receipt via the camera PhotoCapture — new EXPENSE attachment kind
with owner-only upload + reviewer-or-owner download scoping) +
`/admin/expenses` (Mon–Sun weekly review per tech with locations
serviced, approve/reject, CSV export at
`/api/exports/expenses?week=`). New `EXPENSES_REVIEW` permission
(ops manager).

### 5. Automated daily/weekly/monthly reports
`scripts/send-scheduled-reports.ts` (npm run reports:daily|weekly|
monthly) builds an operations report (tickets opened/closed/open by
state, stops completed, delays, busiest schools) and a finance
report (quotes sent/approved totals, POs issued, awaiting-invoice
count, tech expenses — per-tech breakdown in the weekly). Dispatch
goes through the chokepoint via new `report_operations` /
`report_finance` events; recipients are managed on the seeded
rules. Cron lines documented in the deploy runbook.

### 6. PO generation for the customer
"Generate PO for customer" on an approved quote mints
`PO-<year>-<seq>` (collision-retried), records it through the
existing `attachPurchaseOrder` domain function, and lands on a new
printable customer PO sheet (`/quotes/[quoteId]/po`: bill-to
district/school, ticket/device reference, amount, signature line).
Existing POs get a "Print PO" link on the ticket.

### 7. Urgent team-notes banner + click sign-off
New `TeamNote`/`TeamNoteAck` models. Ops + dispatch post notes on
`/team-notes` (new `TEAM_NOTES_MANAGE` permission); every signed-in
user sees active notes as an amber banner on every page until they
click "Got it — acknowledge" (idempotent durable ack + audit). The
manage page lists exactly who acknowledged and who is still
pending; notes can auto-expire or be retired.

### 8. Location sorting
Tickets list: School column header sorts alphabetically; the `#`
affordance sorts by DBN code (numeric) — both directions, filters
preserved. `/admin/schools` gets Name A–Z / DBN code sort toggles.

### 9. Technician schedule/route view
`/me/schedule` now opens with "My upcoming routes": the next 30
days of routes assigned to you with stop count, school sequence,
status pill, and a one-click "Open route". Profile header links to
My expenses / My schedule / Preferences.

## Gates (all green at HEAD)

tsc ✓ · build ✓ · vitest **930** ✓ (new: scheduled-report +
weekStart tests; variable-contract extended to the 4 new events) ·
Playwright **197** ✓ (new: e2e/round-20.spec.ts, 7 tests; smoke
list +3 pages) · forbidden-tokens ✓

## Setup notes

- Run `prisma migrate deploy` (the Docker entrypoint already does).
- Enable the new email rules when ready: `pickup_scheduled`,
  `delivery_scheduled`, `stop_delayed` (SPOC), `report_operations`,
  `report_finance` (team + customer/finance literals) — all seeded
  disabled.
- Add the report cron lines (deploy runbook → "Scheduled jobs").
