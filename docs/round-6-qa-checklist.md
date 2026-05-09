# Round-6 QA checklist

One section per leaf item. Each: acceptance verbatim from the brief,
PASS / DEFER mark, one-line note. **No PARTIAL bucket.**

## Hard gates

- **G1 forbidden-tokens grep** — PASS.
  `bash scripts/check-forbidden-tokens.sh` exits 0 on the merged
  tree. Tested on `font-mono`, `IN_REPAIR`, `cm…20`, and
  `npm run dev` smoke fixtures (all caught).
- **G2 migrations** — PASS in dev. The audit env has no Postgres;
  schema deltas (EmailEvent enum extensions) verified via
  `npx prisma generate`. Production deploy = `prisma db push`.
- **G3 destructive-action audits** — PASS. `removeDeviceFromStop`,
  `addDeviceToStop`, `merge`, `unmerge`, `manual_email_to_spoc`,
  `transition*` all write `AuditLog` rows with `actorUserId` and
  `reason`.
- **G4 dispatchEmailEvent chokepoint** — PASS. Grep for direct
  provider calls outside `lib/email/` returns nothing; `§3C` rule
  in the gate makes regressions visible.
- **G5 prior invariants** — PASS. No new `font-mono` outside
  `<code>`/`<pre>`, no ALL_CAPS in JSX, toast 4s default, humanise
  enums, audit row schema.

## §3C — CI grep hard-gate (commit 1)

Acceptance per brief:
- Add a temporary `font-mono` className to a `<p>` → CI fails.
- Add it inside `<code className="font-mono">…</code>` → CI passes.
- Add `IN_REPAIR` to JSX text → CI fails.
- Add `cm…20` cuid to JSX `<span>` → CI fails.
- Add `Run npx prisma migrate dev` to JSX `<p>` → CI fails; move to
  comment → passes.

PASS — smoke-tested locally with a temp file in `src/_smoketest/`
that triggered all four rules; removed before commit.

## §1A — Add-device redirect

Acceptance: +Add device drawer on a route stop → success lands on
the same route detail page with the green "Device added to stop"
toast. New device appears in the "Devices on this stop" list. No
bare 404.

PASS — `addDeviceToStopAction` resolves `routeId` from `stopId` once
at the top, redirects use `/scheduling/routes/{routeId}` for
success, validation, and unknown-kind errors.

## §1B — Remove-device redirect

Acceptance: × Remove device with reason → success lands on the
same route detail page with the "Device removed from stop" toast.
Empty-stop branch redirects to the same route page with the
"important" prompt.

PASS — `removeDeviceFromStop` returns `routeId` alongside `stopId`;
the action wrapper uses it for both the success and "stop now empty"
branches.

## §1C — `/scheduling/routes` chromed 404

Acceptance: navigating to `/scheduling/routes` lands on either a
real index page or our chromed `/not-found` (sidebar + topbar +
"Common destinations" grid). Never the bare default Next 404.

PASS — Option B chosen. New `app/(app)/scheduling/routes/page.tsx`
calls `notFound()` so the chromed handler renders. See
`round-6-assumptions.md` for the Option A vs B decision.

## §2A — Audit reason text resolves stop cuid

Acceptance: remove a device from a known route stop → /admin/audit
row shows "Removed from stop 1 — P.S. 101 Bronx — 2026-05-06 by
Alex Admin: {reason}". No cuid anywhere in the visible reason text.

PASS — `formatStopLabel({sequence, school}, {date})` lives in
`lib/audit/format.ts`; `removeDeviceFromStop` loads the stop's
sequence + route.date + school.name in the same transaction and
threads the label into both the RouteStop and Ticket audit rows.

## §2B — `humaniseEntity` for the audit "on" column

Acceptance: /admin/audit → no PascalCase squash anywhere in the
"on" column. Specifically Route stop, Staff schedule, Portal token,
Ticket, Email rule, User.

PASS — new `humaniseEntity()` export in `lib/format.ts`; audit page
swaps `humanise` → `humaniseEntity` for `log.entityType`.

## §2C — Mapbox fallback admin disclosure

Acceptance: load `/scheduling/routes/{routeId}` as non-admin → only
"Mapbox token not configured — showing built-in SVG preview." is
visible. No env var name. As ADMIN → disclosure link expands to
"Set NEXT_PUBLIC_MAPBOX_TOKEN in your environment to enable tile
maps." with the var inside `<code>`.

PASS — `RouteMap` accepts `isAdmin` prop; second sentence renders
inside `<details>` only when true. Route detail page passes
`session.role === "ADMIN"`.

## §2D — `/scheduling` subline drops `key=value`

Acceptance: load `/scheduling` as non-admin → no `key=value` strings
in any card subline. As ADMIN → optimizer fragment reads as English
("optimized by nearest neighbor"), not key=value.

PASS — non-admins see only "{N} stops"; admins see "{N} stops ·
optimized by {humaniseOptimizer(name)}". Hyphens flatten to spaces.

## §2E — Audit IdChip click-through with copy

Acceptance: /admin/audit → expand any Ticket row → entity-id chip
is clickable, click body → navigates to `/tickets/{INC}`, click
copy icon → copies cuid, no navigation. Repeat for Route, RouteStop,
Device, StaffSchedule, PortalToken, School.

PASS — `IdChipWithCopy` is a client component; body is a `<Link>`,
copy-icon is a `<button>` that `stopPropagation` + `preventDefault`
the navigation. `hrefForEntity` accepts an `EntityHrefContext` arg
and builds:
- Ticket → `/tickets/{incidentNumber}` (Round-5 §2.11 redirect resolves)
- RouteStop → `/scheduling/routes/{routeId}#stop-{stopId}`
- PortalToken → `/admin/schools/{schoolId}#portal`
- StaffSchedule → `/scheduling/people?scheduleId={id}`
Audit page batch-loads incident numbers per page (one query) so
the chip body shows INC# while the copy payload remains the cuid.

Older audit rows lacking `routeId`/`schoolId` in `after` render
copy-only — see `round-6-assumptions.md`.

## §2F — Portal stat tiles → semantic Links

Acceptance: tab through `/portal/{token}` → each linked tile is
focusable with a visible focus ring. Hover → pointer cursor; click
→ navigates to filtered list. Existing humanised labels still hold.

PASS — new `KpiLink` helper renders each tile as `<Link>` with
`focus-visible:ring-2`. `?status=open|in-warehouse|awaiting-delivery|in-repair`
filters the open-tickets list. "Filtered" banner with `clear` link
when active. "Devices in Repair" tile appears below main strip when
in_repair > 0.

## §3A — Notification triggers (4 events)

Acceptance per event: configure rule with `enabled=true` and the
recipient set per the brief. Trigger the action. Verify:
- `EmailLog` row at `/admin/email-log` with `event` set, status
  sent (or queued+sent on next worker tick).
- `/admin/audit` row with `action='email:dispatch:queued:{event}'`
  (and `:sent:` after the worker pickup).
Toggle `notifyOnEnter=false` on the destination state → transition
again → no email, no audit `email_send` row.

PASS — wired:
- `ticket_assigned` → `updateTicketAction` calls `dispatchEmailEvent`
  when `assignedUserId` changes to a different user (skipped on
  self-assign). `bulk.ts` already had this for bulk-assign; per-
  ticket path now matches.
- `status_in_repair` / `status_parts_ordered` / `ticket_closed` →
  `transitionTicket` calls `maybeDispatchTransitionEmail` after
  the transaction commits and after the SSE publish. Gated on
  `getEffectiveNotifyOnEnter(state, statusConfig)` server-side.
- Forbidden-tokens scan still clean — no direct mailer calls.
- Schema: 4 new `EmailEvent` enum values + matching template seeds
  in both `prisma/seed-email-templates.ts` and
  `src/lib/email/template-seed-data.ts` (lockstep policy).

DEFER — auto-seeding default `EmailRule` rows per event filed in
backlog. Admins create rules manually via /admin/email-rules.

## §3B — Email SPOC + Print Work Order

Acceptance: click "Email SPOC" on `/tickets/{INC}` → drawer opens
with SPOC email pre-filled (resolved from school's
`receivesTicketEmails=true` contacts), subject + body pre-filled,
edit body → Send → toast "Email sent to {N} SPOC contacts".
- /admin/email-log row with `event='ticket_update_to_spoc'`.
- /admin/audit row with `action='manual_email_to_spoc'`, actor +
  recipient count.
- School with no SPOC → button disabled with "configure" link to
  /admin/schools/{id}.

Click "Print Work Order" → opens `/tickets/{id}/print?autoprint=1`
in a new tab → print dialog opens immediately → preview shows the
work order with no app chrome, ticket details, signature lines.

PASS — `EmailSpocButton` client component opens a modal drawer;
`emailSpocFromTicket` server action dispatches via
`dispatchEmailEvent("ticket_update_to_spoc", ...)`. Print page is
a server component with inline `@media print` styles + a client
`PrintAutoTrigger` child for the `window.print()` call.

DEFER — barcode of the INC# (brief mentioned `bwip-js`); filed in
backlog for the same round that adds barcoding to the route Print
sheet. INC# in large type at top of page is the same pattern the
route Print sheet uses today.
