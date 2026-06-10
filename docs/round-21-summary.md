# Round-21 summary — field-ops usability & the "buttons do nothing" class

Brief: "bulk apply does nothing", "ready-for-pickup flow is unclear",
"routes/stops don't behave like a driver workflow", "details too
thin", "photo/signature capture needs to be better", "Mapbox token
not configured", plus a full usability audit. Investigation found
most of the route/stop/detail work had landed in R18–R20 but two
platform-level bugs made whole categories of UI play dead, and
several workflows had real gaps. This round fixes the platform bugs
and closes the workflow gaps.

## Root causes found

### RC1 — CSP killed every client component in dev (the "does nothing" class)

`next.config.mjs` sent `script-src 'self' 'unsafe-inline'` in all
modes. Next.js dev mode evaluates HMR chunks through `eval`, so in
`npm run dev` **React never hydrated**: bulk Apply stayed disabled,
the stop accordion wouldn't expand, photo capture/signature/leaflet
never initialised, and the sign-in form fell back to a native GET —
**leaking email + password into the URL** (history, logs, proxies).
Verified live: `EvalError: Refused to evaluate … 'unsafe-eval'` on
every page in dev.

Fixes:
- `'unsafe-eval'` added to `script-src` **in development only**.
- `<form method="post">` on the sign-in form so a pre-hydration
  submit can never put credentials in a query string.

### RC2 — CSP blocked all map tiles (the "Mapbox token" complaint)

R18 had already replaced the "Mapbox token is not configured" error
with a token-free Leaflet+OSM default, but `img-src 'self' data:
blob:` blocked **both** OSM tiles and Mapbox static images, so the
map rendered as an empty gray panel in every mode. Fixed by allowing
`tile.openstreetmap.org`, `*.tile.openstreetmap.org`, and
`api.mapbox.com` in `img-src`. Decision record + config docs in
`docs/maps-and-field-capture.md` (OSM default zero-config; Mapbox
optional via `NEXT_PUBLIC_MAPBOX_TOKEN`; Google retained for the
optional Routes *optimizer*, rejected for display tiles).

## Bulk actions — selection-aware, confirmed, explained

The other half of "Apply does nothing": the target picker offered
all 26 states, most of which are illegal for the selection, so the
server (correctly) skipped every row.

- The bulk island now receives each row's state + the transition
  table; every target option shows **how many of the selected
  tickets can legally move** ("On hold — all 3" / "Closed — 1 of
  3") and targets that apply to none are disabled.
- A live hint line restates the same in words.
- **Confirmation before applying** (count, target, exactly how many
  will be skipped and why). Bulk assign confirms too.
- Apply with no target picked now says "Pick a target status first"
  instead of a zod enum dump.
- Success toasts for moves into Awaiting pickup / Pending delivery /
  Awaiting onsite append "Next: open Scheduling to put them on a
  route."
- Error toasts are now **sticky until dismissed** (a 4s flash isn't
  enough to read why rows were skipped).
- Fixed a ToastHost lifecycle bug: the fade timer's effect cleanup
  cancelled the removal timer it had just scheduled, so every
  auto-dismissing toast became a permanent opacity-0 zombie in the
  DOM (verified live — an "OK" toast still present 9s after firing).
  Removal timers are now tracked separately and only cancelled on
  unmount.

## Ready-to-schedule flow made explicit

- `/tickets?state=AWAITING_PICKUP|PENDING_DELIVERY|AWAITING_ONSITE`
  shows a banner: what these tickets are waiting for + "Open
  Scheduling →".
- (Existing pieces verified end-to-end: scheduling groups → create
  job → route builder → route detail → stop completion cascades.)

## Stops & proof

- **Signature capture now records who signed**: required printed
  name + optional note, stored on new `Attachment.signerName` /
  `Attachment.note` columns (migration
  `20260610200000_attachment_signature_meta`), rendered as a
  "Signed by …" badge + note in every attachment list, audited as
  `signature-captured`.
- SignaturePad fixes: post-`clear()` strokes landed at 2× offset
  (double DPR scale) — fixed; ink color is theme-aware (was
  invisible white-on-white in light mode).
- **Stop failure now requires a reason** (Device not found /
  School closed / Contact unavailable / Access denied / Other) —
  the legacy "DEVICE NOT FOUND — RESCHEDULE REQUIRED" status is
  expressible again and lands in the audit + ticket history.
- Home-page driver cards: one-tap **Complete is only offered for
  stops without device lines**; stops with lines link into the
  route page's per-device check-off (previously the tap bounced
  off the server guard with an error the driver couldn't act on).
  Fail on the home card now confirms first.
- Photo capture added to the **ticket detail** page (bench techs),
  not just stops/expenses.
- Attachment deletes confirm first; uploads/deletes pop success
  toasts.
- Proof sections name their owner ("Photos & proof for stop 2 ·
  PS 118") so captures land on the right stop.

## Fake/broken affordances fixed

- Home-page manager KPI "SLA breached" linked to
  `/tickets?slaHealth=breached&state=open` — **neither param
  existed**; the page silently showed every ticket. Both filters
  are now real (per-state `stateEnteredAt` cutoffs matching
  `lib/reports/sla.ts` semantics; `state=open` = not closed), with
  visible filter controls.
- Tickets pagination dropped school/manufacturer/assignee/sort
  params when paging; it now carries every active filter.
- Ticket detail cuid→incidentNumber 308 dropped query params,
  eating `?ok/?error` feedback after actions; redirect now
  preserves them and `returnTo` uses the canonical slug.
- `npm run lint` had never worked (no eslint config — it prompted
  interactively). Added `.eslintrc.json` (next/core-web-vitals)
  and fixed the 23 pre-existing violations it surfaced.

## Tests

- Unit: 904 passing (2 structural specs updated for the new
  source shapes, 1 for a JSX entity escape).
- e2e updated: bulk-actions spec now covers the confirm dialog, the
  decline path, and the disabled-illegal-target behaviour; new
  `stop-signature.spec.ts` pins draw → name → save → "Signed by"
  badge and the empty-canvas rejection.

## Deferred / follow-ups

- **F2 (R18 backlog)** — hard server-side "proof attached" gate on
  stop completion. Stays deferred pending the offline-tolerance
  design (F3); today's gate is the per-device check-off + explicit
  confirmation line.
- Failure reason is in audit/ticket history but not yet a column on
  the stop card; surfacing `RouteStop.failureReason` structurally
  would help dispatch triage reschedules at a glance.
- CSV export carries state/q/school/manufacturer but not the new
  slaHealth/assignee filters.
- G1–G6 (R20 backlog) unchanged.
