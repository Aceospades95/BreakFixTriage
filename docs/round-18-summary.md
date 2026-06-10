# Round-18 summary

Theme: "make the application actually work end to end" — a
user-filed bug list (bulk actions, route/stops UX, photo proof,
the map, magic links) plus a full QA pass. Every reported bug
reproduced, root-caused, fixed, and pinned with a regression spec.

## Shipped

### §1 — Bulk ticket actions "did nothing"

The actions always ran; the *feedback* never arrived. The redirect
appended `?ok=…` to a `returnTo` that already carried the ticket
list's filter query string, producing `…&assignee=?ok=Moved 2/2` —
the banner param was swallowed into the previous filter value, so
the operator saw the same page with no banner and concluded the
button was dead.

- New `withFeedback(path, kind, message)` helper
  (`src/lib/url.ts`) picks `?` vs `&` correctly; converted every
  feedback redirect in `bulk.ts`, `attachments.ts`,
  `scheduling.ts`.
- `/tickets` no longer emits a dangling-`?` returnTo when no
  filters are active.
- Summary copy humanised (`Moved 2/2 to On hold`), partial
  failures say how many were skipped and why, and a **total**
  failure renders an error-styled banner explaining that the
  selected tickets can't legally reach the target state.
- Regression: `e2e/bulk-actions.spec.ts` (success banner with
  filters preserved + error banner with the reason).

### §7 — Magic links 404'd

Two compounding presentation bugs (the token plumbing itself was
sound): the one-shot banner rendered a *relative* path as plain
text, and the token list rendered `/portal/<8-char-prefix>…` —
which looks exactly like a link but fails `resolvePortalToken`'s
20-char minimum and lands on the portal 404.

- Banner now renders the full absolute URL (via `appBaseUrl()`)
  with a Copy button (`src/components/copy-button.tsx`, clipboard
  + manual-copy fallback for non-HTTPS LAN deployments).
- Token list stops impersonating a URL: "Link starts with
  `<prefix>` — the full link was shown once at creation."
- New `regeneratePortalTokenAction`: revokes the old token and
  mints a fresh one carrying label/expiry/scope forward — the
  recovery path for lost plaintexts.
- Regression: `e2e/portal-magic-link.spec.ts` (generate → visit →
  regenerate → new works → old 404s).

### §5 — Map showed "Mapbox token not configured"

A missing *optional* token rendered as an error in every normal
deployment. Replaced the SVG fallback + amber warning with a real
interactive map: Leaflet 1.9.4 + OpenStreetMap tiles
(`src/components/leaflet-map.tsx`) — token-free, pannable,
numbered pins, dashed route line, popups. Mapbox static imagery
remains an optional upgrade via `NEXT_PUBLIC_MAPBOX_TOKEN`
(documented in `.env.example`). Google Maps was evaluated and
rejected: it requires an API key bound to a billing account —
wrong fit for a self-hosted Unraid deployment.

Test-seed schools now carry Bronx street addresses with lat/lng so
the map renders in e2e (`e2e/route-map.spec.ts`).

### §3 — Route detail / stops rework

- **One stop at a time**: `StopAccordion` renders stops as compact
  summary rows; exactly one expands. The first actionable stop
  (en-route/arrived, else first scheduled) opens itself on load.
- **Rich stop cards**: street address, school contact with
  `tel:`/`mailto:` links, required action ("Pick up 2 devices"),
  top ticket priority, technician, time window + arrival
  timestamp, proof requirements, job + school notes, tickets with
  priority pills, device lines (existing), photos & proof.
- **Guarded completion**: `StopCompletion` lists every device line
  as a check-off plus a final confirmation; "Complete stop & save"
  only enables when everything is ticked *and* the stop is
  en-route/arrived. Submits the existing `updateStopStatusAction`
  — audit, ticket cascade, and email dispatch unchanged.
- **Completed stops collapse** into a separate "Completed stops"
  section (collapsed `<details>` rows), so the active list is
  only remaining work. Route meta row gains Technician and
  "N of M stops done".
- **Guardrails**: Fail and Cancel-route are now confirm-guarded.
- Reorder still works and correctly passes the full stop-id list
  even when some stops are terminal.

### §4 — Photo proof capture

`PhotoCapture` (`src/components/photo-capture.tsx`): a "📷 Take
photo" button drives `<input type="file" accept="image/*"
capture="environment">` — opens the rear camera directly on
phones/tablets, falls back to a file picker on desktop, and never
needs a getUserMedia permission prompt (denied-camera simply falls
back to the gallery/file picker). The shot previews with
Retake/Save before anything uploads; saving goes through the
existing `uploadAttachmentAction` (server-side validation, audit,
error banner on failure). 25 MB limit mirrored client-side.
Regression: `e2e/stop-photo.spec.ts`.

### §2 — "Ready for pickup … now what?"

State-aware "Next:" banner on ticket detail
(`src/lib/workflow/next-action.ts` + render in
`tickets/[ticketId]/page.tsx`): one entry per ticket state with a
headline, a sentence of guidance, and a CTA into Scheduling /
Quotes / Invoices / Bench / Duplicates where the work actually
happens. AWAITING_PICKUP and PENDING_DELIVERY explicitly say
"schedule it" and link to /scheduling, closing the loop the R17
scheduling rework started. Hidden on merged-source tickets.

## Gates (all green at HEAD)

- `tsc --noEmit` clean; production build clean
- vitest: 915 passed / 1 skipped
- Playwright: 177 passed (suite grew by 4 specs this round)
- forbidden-tokens grep: clean

## Setup notes

- **Map**: nothing to configure. Optionally set
  `NEXT_PUBLIC_MAPBOX_TOKEN` for Mapbox static imagery.
- The interactive map loads OSM tiles from
  `tile.openstreetmap.org`; the container needs outbound HTTPS for
  tiles to paint (pins/route render regardless).
