# BreakFix Triage — Migration Plan

This plan moves the break-fix operation off its spreadsheet + Apps Script
workflow onto the BreakFix Triage application without stopping daily work.

## Guiding constraints

1. No hard cutover. Operations staff keep working during the transition.
2. Reversible each step. Every phase can be rolled back to the previous one.
3. Business rules are lifted from the legacy system into typed code and
   tests, not copied into new spreadsheets.
4. Validated against the legacy system using parallel runs before cutover.

## Phase 0 — Foundation (this commit)

- Architecture + domain docs written.
- Prisma schema, migrations, and seed data in place.
- Core state machine, import pipeline, duplicate engine, and scheduling
  primitives implemented with tests.
- Local dev environment runnable via `docker compose up`.

**Exit criteria:** `npm run test` green; `npm run db:migrate && npm run db:seed`
produces a working DB; a sample ServiceNow CSV can be imported and a ticket
can be walked through the lifecycle via scripted tests.

## Phase 1 — Auth, UI shell, and read-only parity

- NextAuth.js credentials + Google Workspace OIDC.
- Role-gated dashboard shell.
- Ticket list + detail views.
- Import UI (upload → preview → commit).
- Read-only dashboards: open tickets, aging, by-school.

**Exit criteria:** Operations staff can log in, import a real ServiceNow
export, and see the same counts as the current spreadsheet for one district.

**Legacy rule extraction tasks (parallel):**

- Catalog every custom function in the Apps Script project and classify each
  as: business rule (port), UI helper (discard), workaround (discard), data
  cleanup (port into importer).
- For each tab in the legacy sheet, write a short markdown note in
  `docs/legacy/tabs/<tab>.md` describing its operational meaning and mapping
  to entities/states in BreakFix Triage.
- Extract all hardcoded lists (status codes, schools, POCs) into seed data.

## Phase 2 — Scheduling & dispatch

- Job entity, route builder, and per-employee day view.
- Drag-reorder + manual overrides.
- Default nearest-neighbor optimizer.
- Notification scaffolding (stdout transport).

**Exit criteria:** Dispatcher can build a pickup or delivery route from the
pending queue and assign it to a driver; driver's day view shows the right
stops.

## Phase 3 — Quotes & OOW workflow

- Quote entity + sub-state transitions.
- Configurable hold window and no-response automation (as a pg-boss job).
- Invoice-required queue.

**Exit criteria:** A ticket can be flagged OOW, a quote drafted/sent/approved,
and the ticket proceeds or closes based on response.

## Phase 4 — External integrations

- Google Workspace email transport (Gmail API) for notifications.
- Optional Apps Script webhook transport as a bridge if the DOE's environment
  prefers it.
- Google Routes API optimizer behind the existing `RouteOptimizer` interface.
- ServiceNow direct API connector behind the `TicketSource` interface.

**Exit criteria:** Notifications send through Workspace; at least one route
optimized with Google Routes; one ServiceNow pull cycle completed from API
instead of CSV.

## Phase 5 — Cutover

1. **Freeze** the legacy spreadsheet to read-only.
2. **Final import** of all historical tickets (including closed) via the
   import pipeline in "historical" mode (no notifications fired, events
   backdated).
3. **Parallel run** for one week: compare daily counts and state distribution
   between legacy sheet and BreakFix Triage for the live district.
4. **Cutover**: staff moves fully to BreakFix Triage. Sheet is archived.
5. **Post-cutover**: monitor audit logs, enable read-only view for leadership.

## Legacy rule extraction template

For each Apps Script function or sheet rule, capture:

```
Name:
Source:        (file:function or sheet!range)
Trigger:       (onEdit, time-driven, manual, formula)
Operational intent:
Current mechanism:
New home:      (state machine / importer / duplicate engine / UI / discard)
Test case:
```

Store these under `docs/legacy/rules/` as they are discovered.

## Validation strategy

- **Count parity.** Per district, compare `SELECT state, COUNT(*)` vs. the
  sheet's tab counts. Differences must be explained.
- **Event replay.** Take one week of legacy edits and replay them as BreakFix
  Triage actions in a staging DB; compare end-state.
- **Audit spot-checks.** Pick 20 random tickets weekly; verify the audit log
  matches what staff remember doing.

## Rollback

Every phase writes only to new tables. The legacy sheet is never modified.
Rollback is `stop using the app`. Cutover itself is the only irreversible
step, and is gated on successful parallel-run validation.
