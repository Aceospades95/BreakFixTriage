# Round-7 backlog

Items deferred from this and prior rounds. Not shipping in Round-7.

Inherits everything from `docs/round-6-backlog.md` plus the
additions below.

## R7-specific deferrals

### Scheduling
- **Day-mode calendar tooltips for schedule blocks** — R7§2G shipped
  side-by-side rendering only; richer tooltips that show the
  block's note, owner avatar, and conflict markers belong in R8.
- **Real `/scheduling/routes` index page (option A)** — R6§1C still
  ships option B (catch-all → notFound). R7 didn't revisit.

### Portal
- **Token-scoped read-only ticket detail view** — R7§2F shipped
  anchor-on-same-page; the full detail view at
  `/portal/{token}/tickets/{INC#}` (description, status timeline,
  school-visible comments only, recent attachments) is filed for
  R8. Spec for visibility scope:
    - Description + summary: visible.
    - Status timeline: visible (humanised states only — no enum slug).
    - Comments: only those flagged `visibleToSchool=true`.
    - Attachments: only those flagged `visibleToSchool=true`.
    - No editable controls, no admin transitions, no internal
      comments, no SPOC editing, no audit log.

### Audit
- **Synthetic merge — UI cleanup of route stop history pane** —
  R7§2D shipped the green-link replacement + the muted "merged
  from SYN-XXX YYYY-MM-DD" annotation. A richer history pane
  (timeline of every device transfer per ticket, including the
  pre-merge synthetic's photos) is filed.
- **Audit row IdChip context for older rows missing routeId/
  schoolId in `after`** — backfill migration filed since R6.

### Notifications
- **Live integration test for the 8 notification trigger paths** —
  R7§3A + §3B shipped structural smoke tests in
  `tests/notification-triggers.test.ts`. The full HTTP-level test
  that drives a real `EmailLog` write + asserts the bell endpoint
  count requires a CI Postgres + a fake transport, both filed
  alongside the existing Playwright crawler item.
- **Auto-rule seeding for §3A + §3B events** — admins still enable
  rules manually (R6 §3A's PASS-with-DEFER pattern). A
  `seedDefaultEmailRules()` action that mirrors
  `seedDefaultEmailTemplates()` is filed.
- **Remaining 2 of 10 status-change notification events** — R6 +
  R7 covered 8. Still pending: `status_diagnosis`,
  `status_returned`, `status_invoice_required`, `sla_breach`. Need
  recipient design + provider matrix work.

### Imports
- **Live importer integration test for the §3C auto-merge path** —
  same blocker as the §3A live test. Structural smoke shipped in
  `tests/snow-merge-importer.test.ts`.
- **Cross-school collision admin tooling** — when the importer
  flags a cross-school serial collision, an admin needs a
  view that lists every open collision with a "merge anyway" /
  "split device" / "ignore" affordance. Filed.

### Bench
- **Per-tech bench lanes verified against real assignee data** —
  R5 design landed; needs a triggered active assignee to verify
  sort + state badges.
- **Tickets list pagination at 500 rows** — current count 255,
  not yet a problem but trending.
- **Bench DnD between lanes** — R3 backlog item.

### CI / infrastructure
- **Playwright link-smoke crawler in CI** — needs CI Postgres +
  browser runtime. Same blocker as the live integration tests.
- **Forbidden-tokens allowlist regression tests** — extend
  `tests/forbidden-tokens.test.ts` to exercise every rule + every
  allowlist combination. Round-7 §3C extends the gate (Rule 5)
  but doesn't add per-rule unit tests.

### Quote / Invoice / RMA / SLA
- **Quote builder UI** — R2 backlog item.
- **Invoice generation finalize** — R3 backlog item.
- **SLA pause + RMA flag + manual time entry** — all R3 backlog.
- **SLA column real-elapsed calculation** — currently shows "0d";
  needs SLA-elapsed calculator with `slaPausedAt` exclusion.

### N1 / N2 follow-ups
- **N1: bulk add-device, barcode scan, photo upload on +Add drawer**.
- **N2: Week mode for /scheduling/people, hour/minute pickers,
  recurrence, mobile geofencing for in-the-field GPS**.

### Print
- **Print Work Order barcode** — R6§3B DEFER note. Filed alongside
  route Print sheet barcoding.

### Admin status editor
- **Status admin chevron-expand exposes raw enum slug for engineers**
  — R6§2B intentionally kept the slug visible inside the expand
  panel. Should be `data-testid` gated, not visually rendered for
  ops, per the brief's discipline. Filed.

### Org chart / vendors
- **Org chart / subcontractors / vendor management** — R3 backlog.

### Imports source policy
- **/imports SOURCE abbreviation policy** — R7§2B picked
  "ServiceNow CSV". Revisit if ops disagree.
