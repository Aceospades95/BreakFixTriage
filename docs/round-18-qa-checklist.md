# Round-18 QA checklist

Verification protocol for the R18 changes. Prereqs:
`npm run db:seed && npm run db:seed:test`. Everything below was
executed against the e2e build before shipping; the starred items
are also pinned by automated specs.

## §1 Bulk actions ★ (`e2e/bulk-actions.spec.ts`)

1. /tickets?state=TRIAGE as Dana → tick 2 rows → "(2 selected)"
   appears → Transition to "On hold" → Apply → green banner
   "Moved 2/2 to On hold", URL still carries `state=TRIAGE`.
2. /tickets?state=CLOSED → tick 2 rows → Transition to "On hold"
   → Apply → RED banner: "No tickets moved — 2 selected tickets
   are not allowed to go to On hold from their current state."
3. Bulk assign → "Assigned N tickets" banner; unassign works.

## §7 Magic links ★ (`e2e/portal-magic-link.spec.ts`)

1. /admin/schools/<id> as Alex → Generate link → banner shows the
   FULL `https://…/portal/<20+ chars>` URL + working Copy button.
2. Open the URL in a private window → portal renders (no 404).
3. Token row says "Link starts with `<prefix>`" — no fake link.
4. Regenerate link → fresh URL works, the previous one lands on
   the portal 404.

## §5 Map ★ (`e2e/route-map.spec.ts`)

1. Route detail with addressed stops → interactive Leaflet map,
   numbered pins, dashed legs, OSM attribution. No "Mapbox token
   not configured" text anywhere in the app.
2. Stops without coordinates → calm "add lat/lng" empty state.
3. With `NEXT_PUBLIC_MAPBOX_TOKEN` set → Mapbox static image.

## §3 Stops accordion ★ (`e2e/personas/driver.spec.ts`)

1. Route detail → stops render collapsed; first actionable stop
   is open; opening another closes the first.
2. Expanded card shows: address, contact (tap-to-call/email),
   "Pick up/Deliver N devices", priority pill, technician,
   window/arrival, proof note, notes, tickets, devices, photos.
3. Start → Arrived → completion panel: device check-offs +
   confirmation gate the "Complete stop & save" button.
4. Saved stop moves into the collapsed "Completed stops" section;
   the next stop opens. Progress tile counts up.
5. Fail and Cancel-route both demand a confirm dialog.
6. Reorder (Move up/down) still works for dispatcher on
   DRAFT/PLANNED routes.

## §4 Photo capture ★ (`e2e/stop-photo.spec.ts`)

1. Stop card → "📷 Take photo" → camera (mobile) / picker
   (desktop) → preview renders with Retake + Save.
2. Save → attachment listed with filename/size/uploader.
3. Oversize file → inline client error before any upload; server
   still validates independently.
4. Upload failure → red banner via the action's error redirect.

## §2 Next-action guidance (manual + render check)

1. Any ticket detail → "Next: …" banner under the header matches
   the state (AWAITING_PICKUP says "schedule it" with an Open
   Scheduling CTA; CLOSED says "All done").
2. Merged-source tickets show the read-only banner, no
   next-action.

## Whole-app sweep (automated)

- `e2e/route-smoke.spec.ts`: every page in the app loads for the
  right persona (177-test suite, includes RBAC forbidden checks).
- Axe accessibility sweep: both themes, portal + print sheets,
  empty allowlist.
- vitest 915 ✓ · tsc ✓ · production build ✓ · forbidden-tokens ✓.

## Known limitations (see backlog)

- Proof is stated, not enforced, at completion (F2).
- Check-offs are procedural, not persisted rows (F1).
- Map legs are straight lines, not driving directions (F4).
- No offline mode for drivers (F3).
