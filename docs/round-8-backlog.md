# Round-8 backlog

Items deferred from this and prior rounds. Inherits everything
from `docs/round-7-backlog.md` plus the additions below.

## R8-specific deferrals

### Driver flow (§1D extras)
- **Header `…` menu with Reassign-driver / Edit-vehicle /
  Cancel-route quick actions** — the inline editor + cancel-route
  form already cover the underlying actions; the consolidated
  menu is UX polish.
- **Photo helper labels + thumbnail previews on PHOTOS & PROOF**
  — needs a thumbnail derivation pipeline; storage policy
  decision overdue from R3.
- **SCHOOL CONTACT SIGNATURE pad + Name / Role text inputs** —
  typed-name accessibility fallback for users who can't sign on a
  touchscreen.

### People schedule (§1E extras)
- **Configurable Day window via Settings (replace 8a–5p hardcoded)**
  — needs new Settings keys peopleScheduleDayStart /
  peopleScheduleDayEnd. Filed alongside the R6 day-mode tooltips.
- **Single popover form per row** — current implementation has
  one inline form per row; the brief asks for one popover anchored
  to the clicked row. Lower-priority polish.

### Tickets list (§2D unfinished)
- **SUMMARY column smart-split widths** — current truncate is
  acceptable; ideal fix is a column-width algorithm tuned for
  ≥1280px viewports.
- **Hide closed-merged tickets by default + "Show merged" filter**
  — small but touches the saved-filter chip system.
- **BULK ACTIONS clarified placeholder** — "— don't change —" vs
  "Unassign all selected" tweak.
- **"N selected" indicator near Bulk Actions** — visual cue when
  rows are checked.
- **Filter expansion: REPORTED date range, PRIORITY, DEVICE
  model** — small UI work.
- **Saved-filter / quick-filter chips** — design + storage layer
  work.

### Kanban (§2C unfinished)
- **Closed column at the end** — needs page layout adjustment.
- **`+243 more` indicator click-to-expand** — paginated overlay.
- **23-column collapse / Group by phase toggle** — significant UX
  reshape; filed for R9.
- **Auto-refresh dot/toggle explicit label** — small fix; the bell
  icon was already addressed via §2E sentence-case headers.
- **▶ play arrow icon tooltip** — small fix.

### Bell / shortcuts / search / scan (§2E + §2I)
- **Cmd+K global palette** — design only, R9 candidate.
- **New shortcuts: g p / g u / g n / g , / g .** — small additions.
- **/scan manual code entry fallback** — needed for USB barcode
  scanners that emulate keyboard input.
- **Top-bar search INC# direct hop** — when typed entry matches
  /^INC\d{7}$/ jump straight to /tickets/{INC}.
- **Search dropdown phone redact for non-admin** — gate via
  permissions check.
- **School result "View all N tickets at this school →" sub-action**
  — small UX add.

### Profile / preferences (§2F unfinished)
- **Theme picker exposed in avatar dropdown** — Light / Dark /
  System sub-toggle.
- **Daily-digest hour HH:MM picker** — replaces integer 0–23.
- **Timezone selector** — carry-over from R6.

### Admin polish (§2G unfinished)
- **/admin/users inline action menu (Edit / Reset password /
  Reset 2FA / Disable)** — Reset 2FA already exists; menu
  consolidation needed.
- **/admin/users search-by-name/email + role filter** — small
  search box.
- **/admin/users/[id] password-reset confirmation field** —
  policy decision: prompt confirm vs single click.
- **/admin/districts ACTIVE column checkmark** — visual polish.
- **/admin/devices filter / pagination / click-through on
  TICKETS count** — needs server-side filter.
- **/admin/parts empty-state CTA** — small fix.
- **/admin/holidays bulk-import US federal + Today jump** —
  bulk-import shipped via §3B; jump-to-today + manual bulk for
  state holidays still pending.
- **/admin overview count badges expanded** — six more cards
  need badges.
- **Bulk-close stale duplicate UI** — pick one canonical surface
  (settings page vs dedicated /admin/tools/bulk-close).

### Dashboards (§2H unfinished)
- **Aging > 30d 100 tile click-through to filtered list** —
  needs the /tickets list to honor the filter.
- **Open tickets by state — show all non-zero or "Show all"**
  expander.
- **Productivity "closed per assignee" subline rephrase**.
- **Empty-state celebration emoji differentiation (zero data
  vs success state)** — small fix.

### My day (§2J context)
- **My Day OPS ATTENTION reconciliation tooltips** — shipped in
  R8 §2J; the deeper "align both definitions to Planned +
  In-progress" decision is pending product input.

### Notifications + integrations
- **Live HTTP-level Playwright nav-smoke** for the /not-found
  grids — Round-7 §1C structural test ships; the click-every-link
  spec needs a runtime.
- **Playwright READ_ONLY full UI walk** — Round-8 §3C structural
  test ships; the affordance-by-affordance check needs Playwright.
- **Playwright /scheduling/people HH:MM + create-block + edit-block
  + delete-block spec** — Round-8 §1E shipped HH:MM input + role
  filter; live spec deferred.
- **Live integration test for the 8 notification trigger paths**
  — Round-7 §3A + §3B structural smoke ships; live test needs
  CI Postgres + fake transport.
- **Live importer integration test** — Round-7 §3C structural
  smoke ships; live test needs CI Postgres.
- **Recent sessions panel on /admin/users/[id]** — Round-8 §3A
  ships the audit hook + last-sign-in column; the "last 10
  sign-ins with IP + user-agent fingerprint" panel is its own
  rendering / fingerprint-policy work.
- **Failed sign-ins pre-filter chip on /admin/audit** —
  needs the failed-sign-in audit hook.
- **/admin/email-log per-recipient grouping + resend** —
  structured rendering work.

### Schema deltas
- **`Vehicle` table or `Settings.vehicleRefPresets`** for the
  §1D inline editor's optional preset list.
- **`UserSession` table** for the §3A recent-sessions panel.

### Notifications still pending
- **Remaining 2 of 10 status-change events**: status_diagnosis,
  status_returned, status_invoice_required, sla_breach.
- **Auto-rule seeding for §3A + §3B status events** — admins
  enable manually; first-run seed (§3B) only seeds the
  ticket_created example rule.

### Admin observability (continued)
- **Status admin chevron-expand exposes raw enum slug for
  engineers** — should be `data-testid` gated.
- **/admin/email-log per-recipient grouping** — backend work.

### CI / infrastructure
- **Forbidden-tokens allowlist regression tests** — extend
  tests/forbidden-tokens.test.ts with per-rule + allowlist
  combination cases.
- **Playwright runtime + CI Postgres** — meta-deferral that
  unblocks every "live test" item above.

### Quote / Invoice / RMA / SLA (carry-over from prior rounds)
- **Quote builder UI** (R2)
- **Invoice generation finalize** (R3)
- **SLA pause + RMA flag + manual time entry** (R3)
- **SLA elapsed real calculation** (R4)

### N1 / N2 follow-ups
- **N1: bulk add-device, barcode scan, photo upload on +Add drawer**
- **N2: Week mode for /scheduling/people, hour/minute pickers,
  recurrence, mobile geofencing**

### Org / vendors
- **Org chart / subcontractors / vendor management** (R3)

### Multi-region
- **Multi-region deployment (NYC vs others)** — design only.

### Source policy
- **/imports SOURCE abbreviation policy** — R7 chose "ServiceNow CSV";
  open to revisit.
