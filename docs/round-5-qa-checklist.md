# Round-5 QA checklist

One manual test per item. Anything that doesn't pass here either gets
fixed before the branch lands or moves into `docs/round-5-backlog.md`.

## §1 — N1 visible UI

### Add device on a route stop
1. Sign in as ADMIN (or any role with `STOPS_UPDATE`).
2. Open any in-progress route at `/scheduling/routes/<routeId>`.
3. On any stop, expand "+ Add device".
4. Enter `Serial #`, pick a `Model`, optionally fill `Asset tag` and
   `Condition`. Click `Add`.
5. The page should reload with a toast "Device added to stop", the
   new row appears in the device list with a `SYN` badge, and a
   linked synthetic ticket appears with a `SYN-XXX` incident number.

### Remove device
1. On the same stop, click `× Remove` on a device row (optionally
   type a reason).
2. The row dims to 50% opacity and labels itself "removed YYYY-MM-DD";
   the linked ticket stays open (does NOT close).

### SYN- numbering
1. The on-route add path mints incident numbers prefixed `SYN-`.
   Confirm by visiting the linked ticket detail and checking the
   page title / breadcrumb.

### Unlinked lane on `/bench`
1. Open `/bench?scope=all` as a manager.
2. Confirm a violet-bordered lane labeled "Unlinked · SYN" appears
   to the right of the Unassigned lane, listing every
   `PENDING_PICKUP_UNLINKED` ticket with a "Resolve at /duplicates"
   link at the bottom of the lane.

### `/duplicates` resolve card for SYN- tickets
1. Open `/duplicates`.
2. The top section "On-route synthetic tickets awaiting SNOW link"
   lists every PENDING_PICKUP_UNLINKED ticket with a `Link to SNOW`
   form.
3. Type a real INC# in the input and click `Link to SNOW`. The toast
   should read "Linked SYN ticket to INC-XXXX" with a 6s lifespan.
4. The synthetic ticket closes; visiting it now redirects to the
   SNOW target with a "Merged — showing target" toast.

### INC URL resolution
1. Hit `/tickets/INC0001234` directly in the browser. If a ticket
   exists with that incident number, the page redirects to its CUID
   URL. If not, the page renders the standard 404.

---

## §2.1 — slug pill stripped from `/admin/statuses`

1. Open `/admin/statuses`. Each row's left column should now show a
   small coloured dot (the colour group) instead of the full
   `STATE_NAME` slug pill.
2. Expanding a row reveals an "Internal name: <code>STATE_NAME</code>"
   line at the top of the detail panel — the slug is preserved as
   technical reference, just not in the row header.

## §2.2 — humanise sweep round 3

1. `/scheduling`: route status pills read "Planned" / "In progress" /
   "Completed" — never `IN_PROGRESS` etc.
2. `/scheduling/calendar`: month cells show "Planned" / "In progress"
   etc. as humanised text in the per-route line.
3. `/scheduling/routes/<id>`: stop status pills read "En route" /
   "Arrived" etc. JobType pills read "Pickup" / "Delivery" / "Onsite".
4. `/tickets/<id>`: priority dropdown options show "Low" / "Normal" /
   "High" / "Critical" — never the slug.
5. `/admin/templates`: priority column is humanised; priority dropdown
   in the create-form is humanised.

## §2.3 — Mapbox tiles + fallback panel

1. Without `NEXT_PUBLIC_MAPBOX_TOKEN`: open any
   `/scheduling/routes/<id>`. The map area shows the SVG fallback
   plus a small amber banner: "Mapbox token not configured — showing
   built-in SVG preview. Set NEXT_PUBLIC_MAPBOX_TOKEN to enable tile
   maps."
2. With the env var set: refresh the same route page. The map area
   replaces the SVG with a Mapbox `streets-v12` static-tile image
   showing every stop as an orange numbered pin.

## §2.4 — Day | Week | Month segment control on `/scheduling/calendar`

1. Open `/scheduling/calendar`. A `Day · Week · Month` segment control
   appears in the header (next to the prev/next nav).
2. Click `Day`. The page renders today's routes as a vertical list,
   each with school stops below.
3. Click `Week`. The page renders 7 columns Mon-Sun with route cards
   per day. Today is highlighted with an accent ring.
4. Click `Month`. The existing 6×7 month grid renders.
5. Each view's prev / next links keep the same view.

## §2.5 — bench per-tech lanes

1. Open `/bench?scope=all` as a manager.
2. Each active assignee renders as its own 320px wide lane in a
   horizontally scrollable strip; the page no longer forces a
   2-column grid.
3. Lanes with breached SLA tickets show a red `N ⚠` chip in the
   lane header; lanes with no breaches show only the count chip.

## §2.6 — merge UX rewrite

1. Sign in as ADMIN. Merge ticket A into ticket B from A's detail page.
2. The toast reads "Ticket merged" and lasts 6s (not 4s).
3. Visiting A directly redirects to B with a "Merged — showing target"
   toast (also 6s).
4. From B, click any merged-source link in "Merged in (N)". A
   navigates with `?view=source`; the page renders A read-only with
   a yellow banner: "Read-only: merged source. This ticket was merged
   into INC-xxx. Edits and transitions go to the target." Admins see
   an `Un-merge` button on the right of the banner.
5. Click `Un-merge` (optional reason). A's `mergedIntoTicketId`
   clears, A's state restores from the latest `merge` audit row's
   `before.state`, and the toast reads "Merge reversed — source
   ticket re-opened" (6s).

## §2.8 — districts Add button width

1. Open `/admin/districts` at a 1316px viewport width.
2. The `Add` button in the create-district form reads on a single
   line — no per-letter wrapping. The button has `min-width: 4rem`.

## §2.9 — dashboards 12-month chart

1. Open `/dashboards`.
2. The "Closed tickets (last 12 months)" chart renders **12** monthly
   bars even when only a subset of months have data. Months with 0
   closed tickets render as zero-height (no bar).
3. The Y-axis shows three reference lines (0, half-max, max) with the
   max rounded to a nice number (5, 10, 25, 50, 100, …). Hover any
   bar to see "N closed in YYYY-MM".

## §2.10 — portal stat-tile labels

1. Open the school portal at `/portal/<token>`.
2. KPI tile labels read "Open Tickets", "In Warehouse",
   "Awaiting Delivery" — title-cased, **not** all-caps.
3. Section headings ("Open Tickets (N)", "Recently Closed (N)") are
   the same — title-case, not all-caps.

---

## §3.1 / §3.2 / §3.3 — devnote scrub & CI extension

1. `npx vitest run tests/forbidden-tokens.test.ts` passes locally.
2. The scan flags any new `Round-\d+`, `§[A-Z]?\d+` token, or
   `npm run` / `npx` / `prisma db` in JSX text introduced after
   Round-5. Test by adding such a string to any page in
   `src/app/` and re-running the scan; remove before committing.
3. Click "Seed example rule" on `/admin/email-rules` (admin only):
   the page shows a toast "Seeded example rule for new tickets"
   and the rule appears in the table. Clicking it again surfaces
   "Example rule already exists — nothing changed."
4. Click "Seed default templates" on `/admin/email-templates`: every
   default template upserts; the toast reports the count.

---

## Hard gates (run before push)

- `npx vitest run tests/forbidden-tokens.test.ts` — green.
- `npx tsc --noEmit` — green.
- `npx prisma migrate status` — clean (no pending). Audit
  environment skips this when no DB is reachable.
- Spot-check `/admin/audit` after each destructive action above:
  every row carries a non-null `actorUserId`, a meaningful
  `action` slug (`merge`, `unmerge`, `route.stop.device.added`,
  `route.stop.device.removed`, `seed`, `seed:noop`), and a
  populated `reason`.
- Email send: confirmed via `EmailLog` row creation, never via a
  direct provider call. The forbidden-tokens scan enforces this
  by flagging any direct import of `@/lib/email/provider` outside
  `src/lib/email/dispatch.ts`.
