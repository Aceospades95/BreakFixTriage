# Round-9 backlog

Items deferred from this and prior rounds. Inherits everything
from `docs/round-8-backlog.md` plus the additions below.

## R9-specific deferrals

### Round-8 regression Playwright variant
- Live HTTP-level Playwright spec at
  `tests/round-9/round-8-regression.spec.ts` that visits each R8
  page, clicks each affordance, and asserts visible text.
  Structural variant ships in `tests/round-9/round-8-regression.test.ts`.

### §1E (subset) — Sessions panel + sign-out-all
- New `Session` schema model with `userId, createdAt, lastSeenAt,
  ip, userAgent, revokedAt`.
- Session-write middleware on every authenticated request.
- `/admin/users/[id]` Recent sessions panel rendering last 10 with
  ip + UA fingerprint.
- "Sign out all sessions" button (audit
  `action=user.sessions_revoked`).

### §2B — /scheduling/people block end-to-end Playwright
- Click + Add → dialog → time pickers → save → verify block
  renders → click → edit/delete.
- Needs Playwright runtime.

### §2D — /admin inline action menus
- Kebab menu on each /admin overview card with quick actions:
  - Users → New user
  - Districts → New district
  - Devices → Import devices
  - Email rules → Seed example rule
  - Email templates → Seed default templates
  - Holidays → Add holiday
  - Bulk close stale → open dialog
- Larger UI workstream.

### §2E — Cmd+K command palette
- Global keyboard listener.
- Fuzzy search index over: nav destinations, ticket numbers
  (INC*, SYN*), school codes, device serials, user names.
- Hitting Enter routes.
- Uses humanise library for nav labels.

### §2F — Bulk actions dynamic selection count
- "(N selected)" count needs client-state checkbox tracking.
- Existing structure has `data-testid="bulk-actions"` hook in
  place for the future client component.

### §3A — Live integration tests
- GitHub Actions Postgres 16 service container.
- `prisma migrate deploy` + seed before tests.
- `playwright test --project=integration`.
- Cover: import flow round-trip, route lifecycle, quote → invoice
  flow, audit log writes per destructive action.

### §3B — Sessions schema migration
- Implements §1E sessions panel + sign-out-all infrastructure.

### §3E — Read-only Playwright full walk
- Sign in as `readonly@breakfix.local`.
- Walk 100% of routes; assert every write button is hidden /
  disabled / 403.

## Carried from Round-8 backlog

### Driver flow extras
- Header `…` menu with Reassign-driver / Edit-vehicle / Cancel-route.
- PHOTOS & PROOF helper labels + thumbnail previews.
- SCHOOL CONTACT SIGNATURE pad name+role text inputs.

### People schedule extras
- Configurable Day window via Settings.
- Single popover form per row.

### Tickets list (carry-over)
- SUMMARY column smart-split widths.
- Hide closed-merged tickets by default + "Show merged" filter.
- BULK ACTIONS clarified placeholder.
- Filter expansion: REPORTED date range, PRIORITY, DEVICE model.
- Saved-filter / quick-filter chips.

### Kanban (carry-over)
- "+243 more" indicator click-to-expand.
- 23-column collapse / Group by phase toggle.
- ▶ play arrow icon tooltip.

### Search / scan (carry-over)
- Top-bar search INC# direct hop.
- Search dropdown phone redact for non-admin.
- School result "View all N tickets at this school →" sub-action.

### Profile / preferences (carry-over)
- Theme picker exposed in avatar dropdown.
- Timezone selector.

### Admin (carry-over)
- /admin/users inline action menu.
- /admin/users search-by-name/email + role filter.
- /admin/users/[id] password-reset confirmation field.
- /admin/districts ACTIVE column checkmark.
- /admin/parts empty-state CTA.
- /admin/holidays bulk-import + Today jump.
- /admin overview count badges expanded.
- Bulk-close stale duplicate UI canonical surface.

### Dashboards (carry-over)
- Aging > 30d 100 tile click-through.
- Open tickets by state — show all non-zero.
- Productivity "closed per assignee" subline rephrase.
- Empty-state celebration emoji differentiation.

### My Day
- "Active routes" definition alignment (Planned + In-progress).

### Notifications + integrations
- Failed sign-ins pre-filter chip — PASS in R9 §1E.
- /admin/email-log per-recipient grouping + resend.
- Live integration tests for the 8 notification trigger paths.
- Live importer integration test.

### Schema
- `Vehicle` table or `Settings.vehicleRefPresets`.
- `UserSession` table — moves to R9 §3B above.

### Notifications still pending
- Remaining 2 of 10 status-change events.
- Auto-rule seeding for §3A + §3B status events.

### Admin observability (continued)
- Status admin chevron-expand exposes raw enum slug for engineers.

### CI / infrastructure
- Forbidden-tokens allowlist regression tests.
- Playwright runtime + CI Postgres — meta-deferral.

### Quote / Invoice / RMA / SLA
- Quote builder UI, Invoice generation finalize, SLA pause + RMA
  flag + manual time entry, SLA elapsed calculation.

### N1 / N2 follow-ups
- Bulk add-device, barcode scan, photo upload on +Add drawer.
- Week mode for /scheduling/people, hour/minute pickers,
  recurrence, mobile geofencing.

### Org / vendors
- Org chart / subcontractors / vendor management.

### Multi-region
- Multi-region deployment (NYC vs others).

### Mapbox
- Mapbox token wiring + multi-region support.

### Other
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
