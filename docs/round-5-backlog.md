# Round-5 backlog (out-of-scope items)

This file lists every item the operator brief flagged that did **not**
ship in the current branch. Each entry has a one-line "why deferred"
and a reproducer / observable hint so a future branch can pick it up
without a re-read of the brief.

The shipped scope is documented in `docs/round-5-qa-checklist.md`
alongside a manual test per item. Anything below is tracked here so
nothing falls off the cliff between rounds.

---

## Email orchestration

- **Live SMTP / Resend send-test from `/admin/email-templates/[id]`.** The
  send-test wiring is filed for a follow-up because no Resend API key
  is provisioned in the audit environment; the dispatcher choke-point
  (`dispatchEmailEvent`) accepts the test payload today, but a UI
  button + a `/api/email/send-test` route + key gating still need to
  ship. Acceptance: clicking "Send test to me" from the template
  detail page lands an email at the operator's inbox in <30s with a
  toast confirming the provider id.
- **Monaco editor + live preview on the template detail page.** Today
  the page is a read-only list. The follow-up replaces it with a
  Monaco editor (HTML body + plain-text body), a Mustache-flavoured
  variable list, and a side-by-side rendered preview. Acceptance:
  edits round-trip through the existing `EmailTemplate` model and
  show in the preview panel within 200ms.
- **Per-rule trigger-site audit chip.** When you click a rule on
  `/admin/email-rules`, the detail page should show the last 20
  EmailLog rows that fired off it. Today the rule list shows
  "last fired" only.

## Scheduling / N1 / N2

- **Drag-drop reorder of route stops.** Today reorder is via "↑ Move
  up / ↓ Move down" buttons on each stop card. The brief flagged
  drag-drop as nicer ergonomics. Acceptance: long-press-and-drag on
  any stop card reorders within the route; touch + mouse parity;
  audit row records the new order.
- **N2 staff schedule heat-map view on `/scheduling/people`.**
  Today the page shows a list of staff with their next route + any
  PTO. The follow-up is a 7-day × 4-hour heat-map showing tech
  availability vs. assigned route hours. Acceptance: every cell is
  one of `available`, `on-route`, `pto`, `holiday` with the
  documented colours.
- **Live tech position on the route detail map.** Stops capture
  `arrivedLat/arrivedLng/arrivedAt`; rendering them on the SVG /
  Mapbox map as a moving marker (or a poly-line trail) is filed.
  Acceptance: an in-progress route shows the tech's current stop
  with a pulsing dot; previous stops are static green pins.
- **Mapbox tiles "geojson" path overlay.** The static-image render
  (Round-5 §2.3) supports up to 12 numbered pins but no path
  overlay. The follow-up adds a `path-3+0066ff(<polyline>)`
  parameter for the visit order. Acceptance: routes with 4+ stops
  show a connecting line in visit order at zoom levels 11-15.

## Dashboards

- **Per-school open / aging breakdown on `/dashboards`.** Round-3
  closed the cross-school chart but the per-school drill-down (open
  count, aging > 30d count, last-update) still uses the legacy text
  list. Acceptance: clicking a school name on the dashboard opens
  a modal with the same KPIs as `/dashboards/devices` filtered to
  that school.
- **CSV / XLSX export from every dashboards table.** A "Download"
  affordance on the aging table, the closed-by-month table, and the
  per-school table.

## Tickets

- **Bulk assign + bulk transition from the `/tickets` list.** Today
  selecting tickets only enables the "Bulk close" admin tool.
  Acceptance: bulk-action toolbar appears when ≥1 ticket is checked,
  with Assign-to-tech and Transition-to dropdowns.
- **Saved filter views (per-user) on `/tickets`.** Filter combinations
  serialise into the query string today; saving them as named
  presets per user is filed.
- **Ticket-level subscriptions ("watch this ticket") with email +
  in-app notify on every transition.** The orchestration layer
  supports it (the rule engine has an `assignee_changed` event); the
  UI subscribe-button + `/api/notifications` mount are pending.

## SNOW reconciliation

- **Auto-link a SYN-* synthetic ticket to the next-arriving SNOW
  incident at the same school + device.** Today operators link manually
  via the new `/duplicates` resolve card. Acceptance: when the SNOW
  webhook lands a new INC for `(schoolId, deviceId)` that has an open
  PENDING_PICKUP_UNLINKED ticket, the merger runs automatically and
  surfaces a "Auto-linked SYN-XXX → INC-YYY" toast on the SNOW row.
- **Rebuilt importer dry-run summary screen.** The CSV importer can
  produce a delta preview today (`/admin/imports/preview`); refining
  the summary to show device-by-device add/update/skip with a
  per-row reason is filed.

## Admin UX

- **Route-tree-aware did-you-mean on `/admin/_404`.** The static
  table works; a Levenshtein search across the actual route tree
  would catch typos like `/admin/userss`.
- **Permissions diff view on `/admin/permissions`.** Today the
  editor shows the effective table; a "what changed since defaults"
  sidebar would help operators audit overrides.
- **`/admin/holidays` bulk import.** The page accepts one row at a
  time; pasting a year of NYC DOE holidays in CSV is filed.

## Quality / CI

- **Playwright smoke crawler in CI.** A fixture-driven crawler
  (login as ADMIN, walk every nav link, snapshot HTTP status) is
  wired in `tests/playwright.smoke.ts.skip` but the GitHub Actions
  job is gated on a Postgres service container that isn't yet
  provisioned. Acceptance: PR checks fail when any nav link returns
  a non-200 / non-302 to a non-app page.
- **Visual-regression snapshots on the dashboards.** Per-page
  Playwright screenshots stored in `tests/__snapshots__/` and
  diffed in CI.
- **`tests/forbidden-tokens.test.ts` extension to flag inline
  `padding-x` instead of `px-3` etc.** Out of scope for Round-5;
  the existing scan covers ALL_CAPS, font-mono, Round-N references,
  CLI commands in JSX, and direct email-provider calls.

## Out-of-scope / explicitly punted

- **Mobile app shell.** Brief mentions "future PWA"; today everything
  is responsive web. No work needed.
- **Multi-vendor support.** Schema is single-tenant; if a second
  vendor (e.g. another break-fix shop) onboards, all of the
  `Settings.wynndalcoTeamEmails` etc. need to become per-tenant.
  Filed as ADR-0008 but not started.
- **Import history with rollback.** The importer audits each row;
  selecting a past run and "rollback" is a substantial new feature
  filed as Round-6 candidate.
