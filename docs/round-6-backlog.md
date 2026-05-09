# Round-6 backlog

Items deferred from this and prior rounds. Not shipping in Round-6.

## Bench & Tickets
- **Bench DnD between lanes** — Round 3. Reason: per-row "Assign to…" select is sufficient; DnD is a separate UX project.
- **Bench per-tech lanes verified against real assignee data** — Round 5. Reason: lanes structurally render; need real cross-role data to confirm sort + state badges.
- **Tickets list pagination at >50 rows** — Round 3. Reason: 252 rows render fine; pagination becomes urgent at ~1000.
- **SLA column real elapsed calculation** (currently shows "0d") — Round 4. Reason: needs SLA-elapsed calculator with `slaPausedAt` exclusion; deferred until SLA threshold editor is exercised.

## Notifications
- **Notification triggers, remaining 6 events** — Round 3 (Round-6 §3A took 4 of 10). Reason: top-impact 4 shipped this round; the other 6 (status_diagnosis, status_quote_sent, status_quote_approved, status_returned, status_invoice_required, sla_breach) need recipient design + provider matrix work.
- **Auto-seed default `EmailRule` rows for the four §3A events** — Round 6. Reason: brief mentioned `seedDefaultEmailRules()` but the existing `seedExampleRuleAction` only seeds `ticket_created`. Admins still configure each rule manually via /admin/email-rules; the dispatcher fires only when a rule exists with `enabled=true`.

## Ticket detail QoL
- **Manual time entry** — Round 3. Reason: §3B took Email SPOC + Print Work Order; manual time stays parked.
- **SLA pause** — Round 3. Reason: depends on SLA-elapsed calculator.
- **RMA flag** — Round 3. Reason: dedicated workstream.
- **Attachment delete + thumbnails** — Round 3. Reason: cosmetic + storage policy decision needed.
- **Print Work Order barcode** — Round 6. Reason: §3B brief mentioned `bwip-js` barcode; deferred because the route Print sheet doesn't have one either and the rendering library isn't wired. Operators can still match the printed work order by typing the INC# at top of page.

## Scheduling & Calendar
- **/me/schedule blocks side-by-side on calendar Day view** — Round 5 §2.4 partial. Reason: route stops + schedule blocks render separately; integrating side-by-side is layout work.
- **N1 follow-ups: bulk-add devices, barcode scan, photo upload during +Add** — Round 4. Reason: §1 visible loop is the priority; these are extensions.
- **N2 follow-ups: Week mode for /scheduling/people, hour-and-minute pickers, recurrence, mobile geofencing** — Round 4. Reason: Day mode is sufficient; the rest are extensions.
- **Real `/scheduling/routes` index page (Option A)** — Round 6 §1C. Reason: Option B (catch-all → notFound) chosen this round; a real list belongs in a follow-up alongside list-page polish.

## Admin & Settings
- **Bulk-close stale dry-run preview** — Round 3. Reason: scoped out for tightness.
- **Settings inline-saved chip** — Round 4. Reason: cosmetic.
- **Settings test-email button** — Round 4. Reason: cosmetic; admins can test via /admin/email-templates send-test action.
- **Audit row IdChip context for older rows missing routeId/schoolId in `after`** — Round 6 §2E. Reason: those rows render copy-only. A migration to backfill `parentEntityId` from joined sources is filed for a follow-up.

## Dashboards
- **Dashboards prose copy + last-refreshed indicator** — Round 4. Reason: cosmetic; chart fix from Round-5 §2.9 is the priority.

## CI / infrastructure
- **Playwright link smoke runs in CI** — Round 3. Reason: requires Postgres + browser runtime in CI which isn't provisioned.
- **`tsc --noEmit` and `vitest run` in CI** — Round 6. Reason: jobs are scaffolded in `.github/workflows/ci.yml` but require `npm ci` to succeed in the CI sandbox; verify on first PR run.
- **Forbidden-tokens allowlist regression tests** — Round 6 §3C. Reason: the gate is enforced; a Vitest-side test that exercises every rule + allowlist combination would catch regressions in the script itself.

## Integrations & big features
- **ServiceNow live sync** (currently CSV import only) — Round 4. Reason: full integration project.
- **Quote builder finalize + Invoice generation** — Round 3. Reason: dedicated workstream.
- **Org chart / subcontractor partnerships** — Round 4. Reason: separate project.
