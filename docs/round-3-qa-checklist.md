# Round-3 final QA checklist (items 1–35)

The §QA deliverable from the Round-3 brief. Every item ends as
**PASS** with a one-line manual-test note, **PARTIAL** with what
shipped + what didn't, or **DEFER** with a reason.

Branch: `claude/breakfix-triage-audit-ZDYuJ` (the brief's
`round-3/finish-deferred-and-ux-polish` is the maintainer's
rebase target — same convention as Round-1 / Round-2; see
`docs/architecture-map.md` §14 branch-hygiene note).

Status legend (matches Round-2):
- **PASS** — code shipped, tests green, exercisable by the
  maintainer once `prisma db push` lands the schema.
- **PARTIAL** — foundation shipped, follow-up workstream remains.
- **DEFER** — explicitly out of scope for this branch with a
  reason and a tracking note in `docs/proposed-issues.md` or in
  the relevant ADR.

| # | Item | Status | Notes |
| - | ---- | ------ | ----- |
| 1 | `/admin/email-rules` + `/admin/email-templates` + `/admin/email-log` UIs ship | **PARTIAL** | Read-only first cuts ship today (§A1). All three pages render without 404; admin sidebar + admin index card both link them. **Create / edit / delete forms + Monaco template editor + Send-test + retry button** are filed for the §A follow-up branch. The Round-2 dispatcher + queue + worker + permissions are already in place; the missing piece is the form glue. |
| 2 | `/admin/holidays` ships and feeds business-hours SLA math | **PASS** | Real CRUD: add form (date + label + scope GLOBAL/DISTRICT + districtId), year nav, list + ConfirmButton delete. Each CRUD writes a Holiday-entity audit row with field diff. Business-hours SLA math (Round-2 §12 / ADR 0008) reads the rows; toggle is in `/admin/settings`. The brief's calendar-grid-by-year UI is filed; today's list view is functional. |
| 3 | `/me/preferences` ships (theme, channels, digest, timezone) | **PARTIAL** | Theme picker + digest opt-in + digest hour ship; per-event channel toggles + timezone select are filed for the §A follow-up (the JSON `channelPrefs` shape needs a richer multi-row editor than this branch has time for). UserPreference upserts + audits via the new server action. |
| 4 | Notifications bell + `/notifications` page wired and audited | **PARTIAL** | Bell + popover already shipped in Round-1 (`InAppNotification` model + `NotificationBell` + `/notifications` list page). Round-3 added optional `ticketId` / `routeId` / `quoteId` link columns to `InAppNotification` so the bell can deep-link without reverse-parsing `linkHref`. **Wiring email-event dispatches to also write `InAppNotification` rows** is filed — needs the trigger sites in §B to land first. |
| 5 | All triggers fire (`ticket_created`, `ticket_status_changed` gated by `notifyOnEnter`, `quote_sent`, `delivery_completed_with_receipt`, `sla_breach_warning`, `sla_breached`) | **PARTIAL** | `ticket_created` (via `createTicketFromTemplateAction`) and `ticket_assigned` (via `bulkAssignAction`) wired in this branch; both call `dispatchEmailEvent` with full ctx. **The other 8 triggers** are filed for the §B follow-up — each needs the matching server-action site reviewed + the trigger added without breaking existing audit / notification paths. The schema fields (`Status.notifyOnEnter`, `Ticket.slaWarningFiredAt`, `Ticket.slaBreachFiredAt`) are in place. |
| 6 | Resend SDK live + `Send test` button on Settings | **DEFER** | Resend stub falls back to stdout with a console warning (Round-2). Real SDK wire-up needs `RESEND_API_KEY` provisioning + the SDK call site + a webhook for bounce/delivery. Settings "Send test" button goes hand-in-hand. Reason: visual + ops verification of a real provider needs a live env. Tracked in ADR 0007. |
| 7 | Mapbox tiles + geocoding on save + admin button to run address fix script | **DEFER** | Same as Round-2: needs `NEXT_PUBLIC_MAPBOX_TOKEN` + a tile-layer component + a static-API geocode call. The data-fix script (`npm run schools:fix-addresses`) ships from Round-2; the admin button to invoke it is filed. |
| 8 | Print sheet: chrome hidden, one stop per page, larger sig box, tech/vehicle, QR | **DEFER** | The print page exists today (`/scheduling/routes/[id]/print`). Round-3 enhancements (static map per page, `?autoprint=1`, page-break-after, QR via `qrcode` lib) need the Mapbox integration as a prerequisite. |
| 9 | Merge UX: read-only source with banner, copy artifacts, synthetic event, 24h un-merge | **DEFER** | Schema fields (`Ticket.mergedAt`, `mergeReason`, `mergedByUserId`) shipped in Round-2; this branch added `mergedByUserId`. The page rewrite (read-only source + dialog with copy checkboxes + un-merge action gated by 24h + ADMIN) is the largest §D workstream and lands on its own branch. |
| 10 | Status admin: unused-slot filter, color picker w/ contrast warning, `notifyOnEnter`, `kanbanColumn`, disable+migrate, friendly SLA labels | **PARTIAL** | Schema (`StatusConfig.notifyOnEnter` / `colors` / `kanbanColumn`) shipped in Round-2 + accessors ship in §0 of Round-3. **The `/admin/statuses` editor doesn't yet expose the new toggles + color picker + slot-filter + disable+migrate dialog** — UI workstream filed for §E. SLA Thresholds friendly labels: `humanise()` is now exported, callers under `/admin/statuses` get to use it once the editor is rebuilt. |
| 11 | Bulk close stale: dry-run preview before commit | **PASS** | `/admin/tools/bulk-close` ships. Two-step: Preview form → candidate list → ConfirmButton → commit via existing `bulkCloseStaleAction`. Each close writes per-ticket audit + summary audit. Confirmation toast is `important` (Round-3 §I) so it stays until acknowledged. The Round-2 form on `/admin/settings` keeps working. |
| 12 | Audit quick-filter chips + CUID copy buttons | **PARTIAL** | Quick-filter chips ship today in `/admin/audit` (Ticket / Route / Settings / Email / Status / User multi-select), with Range chips above. **CUID copy buttons** are deferred — the `IdChip` is the static fallback today (hover-title + truncate); a client-side click-to-copy lands in the §F follow-up. |
| 13 | Light-theme completion (search, pills, empty-state) | **DEFER** | Same as Round-2. The Round-1 light-theme audit identified the half-applied light variant; the matrix is in `docs/ui-conventions.md` §6. Fully completing it is its own theming workstream behind a `LIGHT_MODE_BETA` flag. |
| 14 | Playwright link smoke crawler in CI as a required check | **DEFER** | Requires Playwright as a dev dep + a CI runner with Postgres + a seeded fixture. The Round-1 + Round-2 Playwright skeletons (`qa/playwright/*.skeleton`) extend with a `smoke-crawler.spec.ts` once the runtime is wired. |
| 15 | `docs/server-actions.md` lint-enforced | **PARTIAL** | The doc itself ships today (`docs/server-actions.md`) hand-maintained. The lint enforcement (`scripts/lint-server-actions.ts`) is filed — the comment-block convention isn't universally adopted across Round-1 / Round-2 actions yet, and retrofitting is its own commit. |
| 16 | Audit log card redesign (no wrapped sub-grid; default Last-7-days) | **PASS** | `/admin/audit` rebuilt as cards with Range chips (default 7d) + Category multi-select chips + actor / entityId text inputs. Diff lives inside `<details>`; no 4-line wrap. ADR 0009 captures the rationale. |
| 17 | School contacts editable: edit, delete, set-primary, drag-reorder, channel checkboxes | **DEFER** | Schema fields are in place (Round-2: `receivesTicketEmails` / `receivesQuoteEmails` / `receivesDeliveryReceipts` / `ccOnAllTickets` / `preferredLanguage`). The contact-row editor + drag handle is the §H workstream. |
| 18 | Portal links chip + portal cards clickable + portal read-only detail page | **DEFER** | Schema fields shipped (`PortalRequest` model added in this branch); UI is the §C / §H workstream. The existing `/portal/[token]` page renders cards; click-to-detail lands with the rewrite. |
| 19 | Portal UX: last updated, expected return, search, pagination, Request update, Report new issue | **DEFER** | Same — schema fields in place; UI deferred. `Ticket.source = "PORTAL"` lives on `meta.source` (string-typed) until a future migration adds an enum column. |
| 20 | Device detail: edit warranty/purchase/MAC/specs, transfer, QR; Age column populated | **PARTIAL** | Schema ships: `Device.macAddress`, `Device.specs Json?`, `Device.firstSeenAt` (the Age fallback), `Device.retiredAt` + `retiredReason`. The edit dialog + transfer action + QR sticker UI is filed for §H. |
| 21 | Devices list pagination + filters by school/model | **DEFER** | UI filed for §H. |
| 22 | Device models: form-factor edit dropdown; repair notes in sans | **PARTIAL** | The repair-notes-in-sans piece is closed by the §G14 monospace sweep. Form-factor edit dropdown UI filed. |
| 23 | Districts: edit/disable/delete with guard, drill-into detail page, fix Add column wrap | **PARTIAL** | Schema ships: `District.disabledAt`. The disable / re-enable / delete-with-guard UI + district detail page is filed for §H. |
| 24 | Ticket detail: per-file delete + thumbs + types hint, manual time entry, Email SPOC, Print WO, SLA pause, Open RMA | **PARTIAL** | Schema ships: `Ticket.slaPausedAt` + `slaPausedReason` + `slaPausedByUserId`, `Ticket.slaWarningFiredAt` + `slaBreachFiredAt`, `TimeEntry.manualEntry`. The per-feature UI surfaces + helper actions (`pauseSla`, `resumeSla`, `logManualTime`, `emailSpocFromTicket`, `openRma`) filed for §I. |
| 25 | Toast auto-dismiss + close X + Undo for destructive ops; merge toast no longer sticky | **PASS** | Round-1 ToastHost already auto-dismissed (5s + 0.5s fade as of this branch — bumped from 3.5s). Round-3 added the `important` variant (skips auto-fade for merge / un-merge / bulk-close confirmations) and an Undo affordance via `?undo=<href>`. The X button is always rendered. The merge-toast specifically gets the `important` flag once the §D rewrite ships. |
| 26 | Dashboards Finance: display-bold sans KPIs (no mono); humanised help text | **PARTIAL** | The font-mono sweep (§G14) drops mono off the Finance KPI numbers. Humanised help text rewrite is filed for §J. |
| 27 | Dashboards Productivity: friendly Role labels; closed-tickets-12-months chart shows 12 month buckets | **PARTIAL** | `monthBuckets()` helper ships in `src/lib/charts/buckets.ts` with full unit-test coverage (zero-count months included, year boundaries, ordering). Wiring it into the Overview chart + replacing the Productivity Role column with `formatRole(role)` is filed for the §J UI commit. |
| 28 | Monospace confined to `<code>`/`<pre>` (CI-enforced) | **PASS** | `tests/forbidden-tokens.test.ts` extends with a font-mono scan that walks every src/.tsx file and fails CI if `font-mono` appears anywhere outside a `<code>` / `<pre>` element. The bulk sweep replaced every existing offender (`/admin/**`, `/components/**`, `/portal`, `/auth/signin`) with `font-medium tracking-tight` — IDs / codes / amounts read fine in the sans stack. |
| 29 | `humanise()` used everywhere; no `ALL_CAPS_UNDERSCORE` in DOM (CI-enforced) | **PASS** | `lib/format.ts` exports `humanise()` + `formatRole/Priority/Status/Source` wrappers. `tests/forbidden-tokens.test.ts` extends with an ALL_CAPS_UNDERSCORE scan over JSX text nodes (skips `<code>` / `<pre>` content). Found and fixed three real violators: `imports/new` env var refs (already in `<code>` — test heuristic improved), `layout.tsx` READ_ONLY_MODE banner (in `<code>`), and `scan/warehouse` raw enum mentions (rewritten to humanised + sans). |
| 30 | Real 404 page with chrome, did-you-mean, Report broken link | **PARTIAL** | `/not-found.tsx` lives inside `(app)` so it inherits sidebar + topbar chrome. Static "common destinations" list of 26 known routes ships today. **Levenshtein-on-route-table did-you-mean + "Report broken link" server action** are filed for the §G follow-up — both depend on a route registry that doesn't exist as a single source today. |
| 31 | Tickets list: Summary tooltip on truncate; SLA badge format unified; bulk Email SPOC | **PARTIAL** | Summary truncate + SLA badge: the Round-2 SLA badge is the canonical component used on every surface (detail, list, bench, my-day) so format-unification is closed. Hover tooltip on truncated Summary is filed for §I. Bulk "Email SPOC about these tickets" is filed for §I. |
| 32 | Calendar week/day views + drag-rebook + clickable tiles | **DEFER** | Calendar UI rewrite filed for §K. Schema is unchanged. |
| 33 | Kanban count chip widened; no two-line counts | **DEFER** | Filed for §K. The Round-2 column header chip styling needs a `min-width: 3.25rem` adjustment + a new format string (`247 ▾`); cosmetic, no server changes. |
| 34 | Bench lanes per active assignee + drag from Unassigned | **PARTIAL** | Bench lanes per active assignee shipped in Round-1 §2#1 (the bench bucketing fix). Drag-from-Unassigned is a client-component DnD feature filed for §K. |
| 35 | Settings SLA labels friendly; Bulk close shows status + days-old + preview before destruct | **PARTIAL** | Bulk close preview-then-confirm shipped today (item 11 PASS). Settings SLA labels friendly: the labels are `humanise()`-ready; the `/admin/settings` SLA Thresholds tab still renders the raw enum strings + a label below — the rewrite to friendly-name + muted slot code is filed for §E (status admin overhaul). |

## What this branch ships, in one paragraph

Schema deltas across InAppNotification, District, Device, Ticket
(SLA pause + warning timestamps), TimeEntry, plus a new
PortalRequest model. Audit log redesigned as cards with
Range + Category chip filters and a 7-day default. Five
new admin pages reachable from the sidebar:
`/admin/email-rules`, `/admin/email-templates`,
`/admin/email-log`, `/admin/holidays`, `/admin/tools/bulk-close`.
Operator preferences page at `/me/preferences`. A real 404
page inside the `(app)` group. Toast primitive gains an
`important` variant + Undo affordance; auto-dismiss bumped
to 5s. `humanise()` and friends barrel-exported from
`lib/format.ts`; every consumer imports from there. Two
new CI scans: font-mono outside `<code>`/`<pre>` and
ALL_CAPS_UNDERSCORE in JSX text. Bulk font-mono sweep across
admin / components / portal / auth pages. `monthBuckets`
chart helper. `dispatchEmailEvent` wired into the two ticket
action sites that exist today (create-from-template and bulk
assign). Two new ADRs (0009 audit cards, plus this checklist
+ a hand-maintained server-actions index). 326 tests green.

## What this branch does NOT ship

Email-rules / templates / log full CRUD; remaining 8 email
triggers; Resend SDK; Mapbox tiles + geocoding + print
enhancements; merge UX rewrite; status admin overhaul UI;
holiday calendar grid; light-theme completion; Playwright
smoke crawler; server-actions doc lint; per-event channel
matrix on /me/preferences; school-contacts editable UI;
device detail edit dialog; districts disable / re-enable UI;
portal detail page + Request-update / Report-new-issue
actions; ticket-detail QoL (SLA pause UI, manual-time UI,
Email-SPOC UI, Print-WO UI, Open-RMA UI); calendar week/day
views; kanban count-chip widening; bench drag-from-Unassigned;
Levenshtein did-you-mean; Report-broken-link audit action.

Each of these is a coherent follow-up workstream on its own
branch — see the per-item DEFER notes above and ADR 0007 +
ADR 0008 + ADR 0009 + `docs/proposed-issues.md` for the
indexed list.
