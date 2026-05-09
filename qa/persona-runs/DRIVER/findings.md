# DRIVER — static walkthrough findings

Test user: `driver@breakfix.local` / `breakfix-dev` (`Dante Driver`).

## Reachable navigation (per RBAC)
- `/` (My Day) — DRIVER lands here. The "My Routes" section renders
  today's stops with Start / Arrived / Complete / Fail buttons and a
  photo upload form per stop. Confirmed in
  `src/app/(app)/page.tsx`.
- `/tickets`, `/tickets/[id]` — read only (no transition).
- `/scheduling/routes/[routeId]` — view assigned route.
- `/scheduling/routes/[routeId]/print` — printable route sheet.
- `/profile`, `/notifications`.

## Issues observed

### Driver lacks `TICKETS_TRANSITION`
- This is intentional (driver only updates **stops**, not ticket
  state). The stop-status change can cascade to a ticket transition
  via the scheduling action — confirmed in
  `src/server/actions/scheduling.ts`.

### Map links open Google Maps
- Confirmed in `src/app/(app)/page.tsx::buildMapsUrl`. Not driven
  live; relies on lat/lng falling back to text query.

### Photo attach on a stop
- The form posts to `uploadAttachmentAction` with
  `kind=ROUTE_STOP`. The server action validates MIME types via
  `src/lib/attachments/attachment-validation.ts` (covered by
  `tests/attachment-validation.test.ts`). No S1/S2 found in code
  inspection.

## Not exhaustively tested
- Mobile viewport ergonomics. The driver flow is mobile-first; needs
  a real device or mobile-emulating browser.
- Photo capture using `<input type="file" capture="environment">`.
  Static walkthrough cannot exercise.
