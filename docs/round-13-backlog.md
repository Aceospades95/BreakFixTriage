# Round-13 backlog

Filed during R13 — to ship in R14 or later.

## R12 deferred (still open)

- **B3** — §2B R12 deferred: advanced preferences UI (timezone +
  per-event channels). The R3 schema already has the columns;
  the UI is the missing piece.
- **B4** — §2D R12 deferred: kanban drag-drop animation polish.
  Functional but the snap-back transition is jarring.
- **B5** — §2E R12 deferred: admin device-models bulk import
  (CSV upload + dedupe).
- **B6** — §2F R12 deferred: admin parts inventory levels UI
  (per-school min/max thresholds).
- **B7** — §2H R12 deferred: Productivity dashboard tab content
  beyond closed-tickets chart (turnaround / first-response /
  parts-cycle).

## R4 long-running carry-forwards

- **B1** — N1 from R4: route device pickup with
  `PENDING_PICKUP_UNLINKED` merge. Synthetic tickets birth from
  route stops; the merge-with-real-INC# flow on import is
  partially shipped but the live merge UX on /duplicates needs
  the operator-confirm step + audit row.
- **B2** — N2 from R4: technician live location on scheduling
  map (websocket + geofence trigger).

## New in R13

- **B8** — §3H full IP+ASN+OS+browser parser. The R12 §1G
  privacy-by-design choice hashed IP/UA at storage time. R13
  added the "Unknown device" fallback. R14 entrypoint: privacy
  review + (if approved) schema migration to store raw values
  alongside hashes + UA parser library + ASN lookup table.
- **B9** — §1E full axe-core contrast walk. R13 ships a floor
  implementation (hand-rolled WCAG luminance check on body +
  first sidebar link). R14 entrypoint: add `@axe-core/playwright`
  + per-element violation list + allowlist for intentional
  design choices.
- **B10** — §2A driver persona deep-walk: full delivery loop
  with mailpit fixture asserting `dispatchEmailEvent` fires for
  `route_started` + `stop_completed`. Spec scaffolding shipped
  in R13; the mailpit fixture wiring is gated on R12 §2B
  notification dispatch e2e.
- **B11** — Round-12 R13 §1A graduation: `/people` becomes a
  real directory page (not just a redirect). Lists every
  internal user with sub-tabs for "Schedule", "Open tickets",
  "Audit trail".

## Choice-point deferrals

- **B12** — Persona spec assertions on `dispatchEmailEvent`
  rely on either (a) Mailpit running in CI or (b) the
  in-memory transport branch in `src/lib/email/send.ts`. (b)
  is filed in R12 backlog; until either lands the persona
  email assertions only check `EmailLog` row presence.
- **B13** — Audit string format normalisation: R12 §1C
  introduced `user.sessions.revoke_all` (dotted) but R13 left
  `2fa:admin-reset` (colon-prefixed) untouched. Filed for a
  R14 sweep + migration that rewrites historical rows to the
  `<entity>.<verb>` convention.

## Round-14 entrypoints

The biggest deferred items that should headline R14:

1. **Full axe-core contrast walk (B9)** — graduates the §1E
   floor to a per-element WCAG 2.2 sweep.
2. **Persona deep-walk fixtures (B10 + B12)** — Mailpit
   integration unblocks the dispatchEmailEvent assertions;
   audit-row checks already work.
3. **CSV importers (B5 + B6 + R12 carryover)** — schools,
   devices, device-models, parts. Each needs upload + parse +
   dedupe + audit per row.
4. **`/people` graduation (B11)** — real directory page.
5. **Audit string normalisation (B13)** — sweep + migration.
