# Round-10 backlog

Items deferred from this and prior rounds. Inherits everything
from `docs/round-9-backlog.md` plus the additions below.

## R10-specific deferrals

### §1F (subset)
- **Live ip/userAgent capture middleware** — needs a per-request
  hook that bumps `lastSeenAt` + records ip/UA on each
  authenticated request. Schema is in place; the touch-write is
  follow-up work.
- **Live Playwright test** that creates session, revokes, asserts
  row appears.

### §2B — /admin overview kebab menus
- Per-card kebab menu with the documented quick action set
  (Users → New user, Districts → New district, …, Audit log →
  Export CSV). Keyboard accessible via Tab + Space.
- Larger UI workstream.

### §2C — block create end-to-end Playwright
- Walks the people-schedule + Add flow under Playwright. Needs
  Playwright runtime.

### §3A — live integration tests
- GitHub Actions Postgres 16 service container.
- `prisma migrate deploy` + seed before tests.
- `playwright test --project=integration`.
- Cover: import flow round-trip, route lifecycle, quote → invoice
  flow, audit log writes per destructive action, sessions
  create/revoke, email dispatch flow.

### §3B — persona-walked Playwright suite
- One test file per persona: tests/round-10/persona-{driver,
  tech, admin, manager, warehouse, dispatcher, readonly}.spec.ts.
- Each test signs in as that persona, walks every page their
  role can reach, asserts no 500/console.error.
- Asserts every visible button is enabled or disabled correctly
  per the permissions matrix.

### §3D — notification dispatch end-to-end
- Trigger a real status transition that fires notify-on-enter.
- Assert email row appears in /admin/email-log.
- Assert audit row appears in /admin/audit?action=email.
- Assert EmailLog row contains rule + template + recipient +
  provider id.

### §3E — read-only role hardening (API-level)
- POST/PATCH/DELETE every mutation endpoint as Ray ReadOnly.
- Assert 403 on every endpoint.

## Carried from Round-9 backlog

- Round-8 regression Playwright variant.
- Live integration tests blocked on CI Postgres + Playwright.
- Sessions schema migration — graduated R10 §1F (data shape +
  page); ip/UA capture still pending.
- /admin/users/[id] Recent sessions panel — graduated R10 §1F.
- /admin/audit Failed sign-ins pre-filter chip — graduated R9 §1E.
- /admin/email-log per-recipient grouping + resend — pending.
- Carry-over driver flow extras (header `…` menu, photo helper
  labels + thumbnails, signature pad name+role inputs).
- People schedule extras (configurable Day window via Settings,
  single popover form per row).
- Tickets list (smart column widths, hide closed-merged default,
  filter expansion, saved-filter chips).
- Kanban (column collapse persistence, "+N more" expand, ▶ play
  arrow tooltip).
- Search / scan (top-bar INC# direct hop, phone redact for
  non-admin, school sub-action).
- Profile / preferences (theme picker in avatar dropdown,
  timezone selector).
- Admin (inline action menu — graduated R10 §2B DEFER, search/
  filter, /admin/devices CSV import, /admin/parts catalog,
  /admin/holidays bulk-import, /admin overview count badges,
  bulk-close stale duplicate UI).
- Dashboards (aging tile click-through, all-non-zero Open by
  state, productivity rephrase, empty-state celebration
  differentiation).
- My Day "Active routes" definition alignment.
- Schema (Vehicle table or Settings preset list).
- Notifications (remaining 2 of 10 status events, auto-rule
  seeding for status events).
- Admin observability (status admin chevron expand exposes raw
  enum slug — should be data-testid gated).
- CI / infrastructure (forbidden-tokens allowlist regression
  tests, Playwright runtime + CI Postgres meta-deferral).
- Quote / Invoice / RMA / SLA (Quote builder UI, Invoice
  generation finalize, SLA pause + RMA flag + manual time
  entry, SLA elapsed calculation).
- N1 / N2 follow-ups (bulk add-device, barcode scan, photo
  upload on +Add drawer; Week mode for /scheduling/people,
  hour/minute pickers, recurrence, mobile geofencing).
- Org / vendors (Org chart, subcontractors, vendor management).
- Multi-region deployment.
- Mapbox token wiring + multi-region support.
- /tickets/kanban column collapse persistence per user.
- /admin/devices bulk import via CSV.
- /scheduling/calendar week + month views fully functional.
- /dashboards/devices school heatmap.
- Mobile responsive pass on driver flow.
- Real-time updates on /tickets/kanban (websocket / SSE).
- /admin/parts catalog + stock levels.
- Bench page kanban view alternative.
- Quote / Invoice PDF export.
- ServiceNow live sync.
- Reset role-permissions-to-defaults button.
