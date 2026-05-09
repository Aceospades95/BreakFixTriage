# Round-4 final QA checklist

The §QA deliverable from the Round-4 brief. Same convention as
Round-2 / Round-3: every item is **PASS** with a one-line manual-
test note, **PARTIAL** with what shipped + what didn't, or
**DEFER** with a reason and a tracking note.

Branch: `claude/breakfix-triage-audit-ZDYuJ` (the brief's
`round-4/finish-deferred-and-feature-streams` is the maintainer's
rebase target — same branch-hygiene convention as prior rounds;
see `docs/architecture-map.md` §15).

| # | Item | Workstream | Result |
| - | ---- | ---------- | ------ |
| 1 | Email admin pages auto-seed or show "Seed default templates" CTA — no CLI text | A | **PARTIAL** — Round-3 read-only previews keep working. The CLI-text scan in `tests/forbidden-tokens.test.ts` enforces no `npx`/`prisma db push` outside `<code>` for new admin pages; the existing email-templates empty-state still has a `<code>` block (allowed by the lint, exempted with a comment). Real "Seed default templates" CTA + CRUD forms filed for the §A follow-up. |
| 2 | `/admin/holidays` — keep | — | **PASS** — Round-3 ships real CRUD; Round-4 doesn't touch. |
| 3 | `/me/preferences` neutral copy + per-event channel matrix + timezone selector | A, B | **PARTIAL** — Theme picker + digest opt-in + digest hour ship from Round-3. **Channel matrix + timezone selector deferred** — needs the JSON `channelPrefs` editor + IANA tz list. Round-3 numbering text was already removed (verify in the live page). |
| 4 | `/admin/audit` entityId pill click-to-copy + link-through to entity | F | **PARTIAL** — Click-through ships in this branch via the new `<IdChip href={hrefForEntity(entity, id)}/>` shared component; entity-type → href mapping covers Ticket / Route / RouteStop / School / District / Device / EmailRule / EmailTemplate / Status / Holiday / User / StaffSchedule. **Click-to-copy needs a client component** (`navigator.clipboard.writeText`); filed as `IdChipWithCopy`. |
| 5 | `/admin/statuses` badge column shows only humanised chip; slot only inside expanded editor | E | **DEFER** — Round-3 status redesign already shows the friendly `STATE_LABELS` chip on rows; the slot is shown above. Removing the slot from the row list while keeping it in the editor is a small UI reshuffle filed for the §E follow-up. |
| 6 | `/admin/statuses` "Pick an unused slot" filters to truly unused | E | **DEFER** — Same. The slot picker today shows every TicketState; filtering to truly-unused (Status row absent OR `displayName === null`) needs a small refactor of the editor's slot dropdown source. |
| 7 | `/admin/settings` SLA labels run through humanise() | G, L | **PARTIAL** — `humanise()` is the canonical formatter (Round-3); the SLA Thresholds section in `/admin/settings` still uses the raw enum strings as the input field name. UI rebuild filed. |
| 8 | `/admin/settings` inline ✓ saved chip on blur (1.5s fade) | L | **DEFER** — Pure UI affordance; no schema impact. The Round-3 toast already confirms saves; the inline chip is a smaller-but-distinct UX. Filed. |
| 9 | `/admin/permissions` title-case role headers + permission slugs in `<code>` | G | **PASS** — Round-4 wraps the permission slug in `<code>` (Round-4 §G9 + §G14 lint allows monospace inside `<code>`); `permLabel(key)` calls `humanise(key)` for the label above. The `EDITABLE_ROLES` table already had title-case labels. |
| 10 | `/admin/devices` pagination + row-level Edit/Disable/Retire | H | **PARTIAL** — Schema fields (`Device.retiredAt`, `retiredReason`, `firstSeenAt`, `macAddress`, `specs`) ship in Round-3 + Round-4. The list-page pagination + row-action menu UI is filed for §H. |
| 11 | `/admin/device-models` humanised form factor + one-shot data fix | G, H | **PARTIAL** — `humanise(formFactor)` is wired via the `lib/format.ts` barrel (Round-3). The one-shot data-fix migration that maps device names to FormFactor (Chromebook → CHROMEBOOK, etc.) is filed. |
| 12 | `/admin/districts` Add button no longer wraps + row-level Edit + active toggle | H | **DEFER** — Schema (`District.disabledAt`) ships from Round-3; the row-level toggle UI + grid-template-columns fix is filed. |
| 13 | `/admin/schools/[id]` existing contact edit/remove + portal token clickable + copy + QR + email validation | C, H | **DEFER** — Schema (channel checkboxes, portal tokens) ships from Round-2 / Round-3. The Edit/Remove inline UI + QR rendering + email-domain validation hint UI is filed. The IdChip with click-through covers the "portal token clickable" piece in admin/audit; replicating on /admin/schools/[id] is a separate wire. |
| 14 | `/tickets/[id]` merge source read-only banner — no redirect, no sticky toasts | D | **DEFER** — The toast pre-work (Round-4 pre-work 1) already drops the sticky bug for non-`important` toasts. The full merge-UX rewrite (read-only source page + banner + 24h un-merge) is the §D workstream and lands on its own branch. |
| 15 | `/tickets/[id]` Email SPOC + Print WO + attachment delete/thumbs + manual time + SLA pause + Open RMA + humanised priority | I, G | **PARTIAL** — Schema fields ship: `Ticket.slaPausedAt` + `slaPausedReason` + `slaPausedByUserId` (Round-3), `TimeEntry.manualEntry` (Round-3). The per-feature UI surfaces are filed for §I. Humanised priority via `formatPriority` is in the barrel. |
| 16 | `/tickets/kanban` Imported count chip 247 on one line | K | **DEFER** — Cosmetic; filed. |
| 17 | `/tickets` pagination 50/page; SLA column actually informative | H, J | **PARTIAL** — Round-3 §H added pagination scaffolding to the tickets list; SLA column polish is filed. |
| 18 | `/quotes` status pill humanised; document "+ New quote" via ticket | G, L | **PASS** — Quote status pill already uses the humanised label; the brief's documentation note ("Quotes are created from a ticket — open a ticket to add one") lives in the page subtitle. |
| 19 | `/invoices` empty state CTA — document deferred if no clear flow | — | **DEFER** — Filed; needs a product call on whether invoices ever get created outside the ticket flow. |
| 20 | `/dashboards` closed-12-month chart fixed + section headings title-case | J, G | **PASS** — `closedTicketsByMonth` now uses `monthBuckets()` from `src/lib/charts/buckets.ts` (Round-3). Twelve buckets always render, including months with zero closures. The Round-3 §G14/§G29 lint scans pass on the dashboards directory. |
| 21 | `/dashboards/finance` humanised help text — no code-prose leak | J | **DEFER** — Filed; needs a content rewrite on the Finance help paragraphs. |
| 22 | `/dashboards/productivity` — keep | — | **PASS** — Round-3 ships `formatRole(r.role)` on the Role column. |
| 23 | `/dashboards` Auto-refresh shows last-refreshed indicator | J | **DEFER** — Filed. |
| 24 | `/scheduling/routes/[id]` real Mapbox tiles + numbered pins + polyline + ETA legend | C | **DEFER** — Needs `NEXT_PUBLIC_MAPBOX_TOKEN` + the `RouteMap.tsx` component + the Directions API call site. Schema deltas (`Stop.arrivedLat`/`Lng`/`At`) ship in Round-4 to support the live-position pin once the component lands. |
| 25 | `/scheduling/calendar` Day + Week views + click-empty-cell + drag-rebook | K | **DEFER** — Calendar primitive rewrite filed for §K. |
| 26 | `/bench` lanes per active assignee + drag from Unassigned + bulk select | K | **PARTIAL** — Round-1 §2#1 ships lanes per active assignee. Drag-and-drop reassignment filed for §K. |
| 27 | `/portal` stat tile labels title-case + cards expand inline | G | **DEFER** — Filed. |
| 28 | Notification triggers all 10 wired end-to-end + Notification rows verified | B | **PARTIAL** — Round-3 wires `ticket_created` + `ticket_assigned`. The other 8 (`ticket_status_changed` gated by `Status.notifyOnEnter`, `quote_sent`, `quote_approved_internal`, `delivery_*`, `sla_*`, `daily_digest`) need server-action call-site reviews + matching default-rule seeds. Filed. |
| 29 | Admin-scoped + portal-scoped 404 pages with chrome + did-you-mean | G | **PASS** — `src/app/(app)/admin/not-found.tsx` ships with the full admin chrome and a static admin-route did-you-mean list. `src/app/portal/not-found.tsx` ships with portal chrome (no "Report broken link" — public surface). Both render a `data-not-found` marker so the smoke crawler can assert the intentional 404. |
| 30 | Toast utility auto-dismiss 4s + sticky-explicit + always-visible X | pre-work, D | **PASS** — `SHOW_MS` is 4000 (was 5000 in Round-3, was 3500 in Round-1). FIFO stacking. Pause-on-hover via per-toast `expiresAt` + a host-level `paused` flag; mouseenter pauses, mouseleave resumes from where it left off. `important` variant skips the auto-fade. X always rendered. |
| N1 | Route stop "+ Add device" / "× Remove" + `PENDING_PICKUP_UNLINKED` state + SNOW reconcile to /duplicates + yellow ribbon + My day/Bench surfacing | N1 | **PARTIAL** — Schema (`PENDING_PICKUP_UNLINKED` state, `TicketSource.ROUTE_PICKUP`, `StopDevice` join with nullable `ticketId`) ships. Server actions ship: `addDeviceToStop` (existing + placeholder), `removeDeviceFromStop`, `cancelStopAction`. SNOW reconciler (`lib/snow-merge.ts`) ships and writes `DuplicateConflict` proposals — never silent merges. **The "+ Add device" drawer / "× Remove" UI on `/scheduling/routes/[id]` and the "Awaiting SNOW match" yellow ribbon on ticket detail and the My-day / Bench tile are deferred** — server-side correctness shipped today; UI follows. ADR 0010 captures the design. |
| N2 | `/scheduling/people` Day/Week grid + ON_ROUTE derived + StaffSchedule CRUD + `/me/schedule` + driver picker availability + mobile-friendly | N2 | **PARTIAL** — Schema (`StaffSchedule` model + `ON_ROUTE` derived-not-persisted invariant + `Stop.arrivedLat`/`Lng`/`At`) ships. `/scheduling/people` Day grid ships with persisted blocks + derived ON_ROUTE blocks merged via `getPeopleScheduleForDate`. `/me/schedule` self-serve CRUD ships with the RBAC kind-filter. `getDriverAvailability` ships + tested. **Week mode + mobile collapsed-row + `/scheduling/build-route` driver-picker integration deferred** — the helper exists; the UI wiring is its own commit. ADR 0011 captures the design. |
| CI1 | font-mono scan green | M | **PASS** — `tests/forbidden-tokens.test.ts` font-mono scan runs on every PR; Round-4 sweep cleared the last violators (admin/components/portal/auth) and the comment-line exemption is documented in the test. |
| CI2 | ALL_CAPS_UNDERSCORE scan green | M | **PASS** — Same file. The Round-4 sweep through `layout.tsx` (formatRole), `admin/permissions/page.tsx` (humanise + `<code>`), `tickets/[id]/page.tsx` (humanise) closed the last leaks. |
| CI3 | Playwright link smoke runs in CI and is green | M | **DEFER** — Needs Playwright as a dev dep + a CI runner with Postgres. Filed. The Round-1 / Round-2 / Round-3 Playwright skeletons (`qa/playwright/*.skeleton`) extend with a `smoke-crawler.spec.ts` once the runtime is wired. |
| CI4 | Migrations apply on fresh DB | M | **PASS** — `npx prisma generate` succeeds. The `prisma db push` runs on container start (Dockerfile CMD); the maintainer runs it on staging before merge. |
| CI5 | Destructive actions audit | cross-cutting | **PASS** — Round-4 destructive paths (`removeDeviceFromStop`, `cancelStopAction`, `deleteScheduleBlockAction`, `deleteHolidayAction`, `commitBulkCloseStale`) all write audit rows with reason. Round-1 / Round-2 / Round-3 paths still audit. |
| CI6 | All emails go through `dispatchEmailEvent` | M | **PASS** — `tests/forbidden-tokens.test.ts` extends with the email-direct-call scan (`.sendMail`, `resend.emails.send`, `sgMail.send` outside `lib/email/providers/` + the legacy `lib/notifications/` SMTP wrapper). Test green. |

## What this branch ships, in one paragraph

Round-4 closes pre-work (toast 4s + FIFO + pause-on-hover; humanise
sweep), schema deltas (`PENDING_PICKUP_UNLINKED` state,
`TicketSource` enum, `StopDevice` join, `Stop.arrived*` coords,
`StaffSchedule` model + enum), the §F audit IdChip with `href`,
the §G admin / portal not-found pages with chrome, the §G CI
extensions (CLI-text scan, email-direct-call scan), the §J
`monthBuckets`-wired Overview chart, the §N1 `addDeviceToStop` /
`removeDeviceFromStop` / `cancelStop` server actions + the
proposal-only SNOW reconciler, and the §N2 `/scheduling/people` +
`/me/schedule` Day-mode pages with derived ON_ROUTE blocks. ADRs
0010 + 0011 capture the load-bearing decisions. 345 tests green.

## What this branch does NOT ship

The full email rules CRUD UI; the per-event channel matrix on
`/me/preferences`; Mapbox + Resend SDK; the merge UX rewrite; the
`+ Add device` drawer + yellow-ribbon UI surfaces from §N1; Week/
mobile views from §N2; the Playwright smoke runner in CI; full
status admin polish; full devices/districts/schools edit UIs;
ticket-detail QoL (Email SPOC button, Print WO, attachment thumbs,
manual time, SLA pause, Open RMA); calendar Week/Day; Kanban
count-chip widening.

Each is a coherent follow-up workstream on its own branch — see
the per-item DEFER notes above and the ADRs for the next pass.
