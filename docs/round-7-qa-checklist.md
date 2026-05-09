# Round-7 QA checklist

One section per leaf item. Each: acceptance verbatim from the brief,
PASS / DEFER mark, one-line note. **No PARTIAL bucket.**

## Hard gates

- **G1 forbidden-tokens grep** — PASS. Round-7 extended Rule 5 to
  catch QuoteStatus / ImportType / ImportSource / JobType /
  TicketPriority enum values; gate runs clean.
- **G2 ALL_CAPS_UNDERSCORE** — PASS. Allowlist documented in
  `docs/humanise-allowlist.md`.
- **G3 font-mono outside `<code>`/`<pre>`** — PASS.
- **G4 migrations apply cleanly** — verified in dev via
  `npx prisma generate`. Production deploy = `prisma db push`.
- **G5 destructive actions write AuditLog** — PASS.
  `mergeTicket` (R7§1A) writes `Ticket.merge` + per-device
  `Ticket.device.transferred`. `reconcileSnowImport` (R7§3C)
  threads `actorUserId` through every merge / collision / runner-up
  audit row.
- **G6 dispatchEmailEvent chokepoint** — PASS. Smoke test in
  `tests/notification-triggers.test.ts` asserts no direct
  `transporter.sendMail` / `resend.emails.send` /
  `nodemailer.createTransport` outside `lib/email/` +
  `lib/notifications/`.
- **G7 no silent SNOW import merges** — PASS. R7§3C path always
  runs through `mergeTicket` which writes the operator-readable
  comment + audit trail.
- **G8 docs/round-7-backlog.md written** — PASS.
- **G9 docs/round-7-qa-checklist.md written** — this file.
- **G10 docs/round-7-assumptions.md written** — PASS.

## §1A — Synthetic-merge device transfer

Acceptance:
- On synthetic→INC merge, every `RouteStopDevice.ticketId` that
  pointed at the synthetic re-points to the surviving INC inside
  the same transaction.
- Survivor's `Ticket.deviceId` reflects the picked-up device(s).
  When already set, append via the StopDevice ledger; document the
  schema choice (assumptions doc).
- Merge comment lists transferred devices.
- Audit log writes `Ticket.device.transferred` per device with
  `from`/`to` ticket ids.
- Route stop card shows survivor INC#, not the dead synthetic.

PASS — `mergeTicket()` extended in `lib/tickets/merge.ts`. Single
transaction. "First device wins on `Ticket.deviceId`; StopDevice
ledger captures all transferred devices" policy in
`round-7-assumptions.md`. snow-merge tests still green.

## §1B — `/admin/*` chromed 404

Acceptance:
- `/admin/notifications`, `/admin/foo`, `/admin/audit/xyz`,
  `/admin/schools/does-not-exist`, `/admin/users/does-not-exist`,
  `/admin/devices/does-not-exist` all render the chromed not-found
  with `data-testid="chromed-not-found"`.
- Structural fix (re-export / move global), not per-route patch.
- Test asserts the 6 paths render the testid.

PASS — added `(app)/admin/[...notfound]/page.tsx` and
`(app)/[...notfound]/page.tsx` catch-alls; both not-found pages
ship the `data-testid="chromed-not-found"` marker; structural test
in `tests/admin-not-found.test.ts` covers the wiring. Live HTTP
assertion filed in backlog (needs Playwright runtime).

## §1C — Bench card layout wrap

Acceptance:
- INC numbers up to 16 chars render on a single line in both lanes.
- Status pills inside cards no longer wrap.
- Visual smoke at 1280×800: no card-internal text wrap.

PASS — `StatePill` always `whitespace-nowrap`; `CompactTicketList`
rows `flex-wrap` with `gap-x/gap-y`; INC link `whitespace-nowrap`;
shortDescription `basis-full` so it slips below the chip row.

## §2A — Quotes status pills humanise

Acceptance:
- All quote status pills route through `humanise()` and render
  Approved, Cancelled, Draft, Sent, Declined, No response.
- Filter pill labels at top of `/quotes` already title-case —
  parity confirmed.
- Forbidden-tokens CI rule extended to catch QuoteStatus enum
  values.

PASS — `QuoteStatusPill` body is `humanise(status)` +
`whitespace-nowrap`. Forbidden-tokens Rule 5 catches DRAFT, SENT,
APPROVED, DECLINED, CANCELLED, NO_RESPONSE.

## §2B — Imports type/source humanise

Acceptance:
- TYPE pill renders Tickets, Schools, Devices, Users, Parts,
  Device models.
- SOURCE renders ServiceNow CSV / Manual CSV / ServiceNow API
  (no underscore).
- COMMITTED status pill stays as section indicator (uppercase
  tracking is style not enum text — Round-5 ratified).

PASS — `TYPE_LABELS` map sentence-cased; `uppercase` className
dropped; new `SOURCE_LABELS` map. Status pill humanised through
`humanise()`. SOURCE abbreviation policy in
`round-7-assumptions.md` (chose "ServiceNow CSV").

## §2C — Optimizer meta humanise

Acceptance:
- Meta value renders "Nearest neighbor" (title case, no hyphen).
- VEHICLE / OPTIMIZER / LAST OPTIMIZED label cells stay ALL_CAPS
  (styled section labels — R5 ratified).

PASS — new `humaniseOptimizerName` local helper on the route
detail page.

## §2D — Route-stop dead-synthetic cleanup

Acceptance:
- Route stop card after merge shows survivor INC# in green-link.
- Optional muted "merged from SYN-XXX YYYY-MM-DD" annotation.
- Tombstone treatment for removed-via-Remove devices unchanged.

PASS — route detail query loads `sd.ticket.mergedFrom` filtered
to `source=ROUTE_PICKUP`. Card renders survivor INC with state
pill + the muted "merged from SYN-XXX YYYY-MM-DD" annotation.
SYN badge correctly disappears post-merge because `sd.ticket`
points at the survivor (whose source is not ROUTE_PICKUP).

## §2E — Audit RouteStop / StaffSchedule / PortalToken pills

Acceptance:
- RouteStop entity-id pill resolves to "stop {N} — {school} —
  {YYYY-MM-DD}" matching the §2A reason text.
- Same treatment for StaffSchedule + PortalToken.
- Click-through still goes to canonical detail page; copy-icon
  copies the cuid.

PASS — three new batched `findMany` lookups in the audit page;
`hrefForEntity` context picks up `schoolId` from PortalToken row.
Copy-icon writes the cuid; navigation goes to the human URL.

## §2F — Portal ticket cards as anchors

Acceptance:
- Each ticket card on `/portal/{token}` is wrapped in `<a>`.
- Pick a path and document.

PASS — chose anchor-to-`#ticket-{INC#}` (option b) per
`round-7-assumptions.md`. Each card has stable `id` + focusable
`<a>` body with focus ring. Token-scoped read-only detail view
filed for R8.

## §2G — Day view shows StaffSchedule blocks

Acceptance:
- Day view loads StaffSchedule rows alongside Route rows.
- Visual treatment differs (dashed border, pastel fill).
- Click on schedule block routes to `/scheduling/people` for
  that day.
- Empty-state copy adjusts to "No routes or schedule blocks for
  {date}" when both empty.

PASS — Promise.all loads both lists; layout becomes 2-column grid
(routes left, blocks-aside right). Blocks render with violet-
dashed border + pastel fill; click links to `/scheduling/people`.
Empty-state combined copy implemented.

## §3A — Notification trigger smoke (R6 events)

Acceptance:
- Vitest test that asserts the 4 R6 dispatch chains (assigned,
  in_repair, parts_ordered, closed) wire through
  `dispatchEmailEvent` and respect `notifyOnEnter`.
- Bell badge / `/notifications` page increments after each
  trigger.
- "Seed example rule" admin click fires the corresponding event.

PASS — `tests/notification-triggers.test.ts` smoke covers enum,
template seeds, transition wiring, ticket-assign wiring, and the
G6 chokepoint. The HTTP-level integration test that drives a real
`EmailLog` write is filed in `round-7-backlog.md` (needs CI
Postgres + fake transport).

## §3B — Wire next 4 notification events

Acceptance:
- `quote_sent`, `quote_approved`, `delivery_scheduled`,
  `pickup_completed` all go through `dispatchEmailEvent`.
- Each has a stub `EmailTemplate` seedable from
  `/admin/email-templates` "Seed default templates".
- Seeded `EmailRule.notifyOnEnter=false` default.
- §3A smoke test extended to cover all 8 events.

PASS — `quote_approved` + `pickup_completed` enum values added
(`quote_sent` + `delivery_scheduled` already existed). Templates
seeded in both `template-seed-data.ts` + `prisma/seed-email-
templates.ts`. Dispatch sites:
  - `quote_sent` → `sendQuoteAction` post-commit hook.
  - `quote_approved` → `respondQuoteAction` (response=APPROVED).
  - `delivery_scheduled` → `buildRouteAction` per Delivery stop.
  - `pickup_completed` → `updateStopStatusAction` (Pickup +
    COMPLETED).
Smoke test extended; 9 assertions all green.

DEFER — auto-seed default EmailRule rows (carries the R6 §3A
DEFER note forward).

## §3C — SNOW importer auto-merge

Acceptance:
- Vitest test seeds synthetic + import row with same serial,
  same school → assert merge happened, comment + audit rows
  written.
- Cross-school case → no merge, comment on synthetic noting
  collision.
- Multi-synthetic case → merge into older, comment on losers.
- Import outcome row shows "merged-from-synthetic" bucket.
- `/duplicates` queue updated post-import.

PASS — `reconcileSnowImport` rewritten to call `mergeTicket()`
in same-school case; cross-school path writes audit
`snow-merge.cross-school-collision`; multi-synth path writes
`snow-merge.runner-up`. Pipeline wires the call into
`commitImport`. ImportResult + stats blob carry the new counters.
`/imports` outcome rendering shows "{N} merged-from-synthetic"
when the counter is non-zero. School-match policy + multi-synth
ordering rationale in `round-7-assumptions.md`.

DEFER — full integration test that drives a real import upload +
asserts the merge happened on a live Postgres. Filed in
`round-7-backlog.md`.
