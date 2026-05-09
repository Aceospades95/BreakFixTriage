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

## B8 — Read-only role 403 enforcement (DEFERRED)

Round-11 §2C / Round-13 §2F asked the read-only role to be
blocked from every mutation surface with a clear redirect to
`/forbidden`. Three pieces are not yet shipped:

1. `/forbidden` route — `src/app/(app)/forbidden/page.tsx` does
   not exist; `find src/app -name "forbidden*"` returns empty.
2. `src/middleware.ts` does not redirect unauthorized users to
   `/forbidden`. It currently handles only the `READ_ONLY_MODE`
   env-var kill switch + the auth-gate matcher.
3. The read-only role's permission matrix denies access at the
   page level via `requireRole`, which throws `AuthorizationError`
   caught by `(app)/error.tsx` returning HTTP 200 — the spec
   expects 401/403.

Spec lives at `e2e/readonly-role-403.spec.ts` behind
`test.fixme()`. Unfixme each test only when the matching surface
ships.

## B14 — Persona spec aspirational coverage (DEFERRED)

The Round-13 §2A-§2G persona walks assume app surfaces and test
hooks (`data-testid="people-row"`, `data-testid="route-stop"`,
`data-testid="bulk-actions"`, `data-testid="available-transitions"`)
that are not yet wired on this branch. Specs are marked
`test.fixme()` so the coverage commitment stays visible. Each
test reactivates by removing the `.fixme` suffix once the
underlying surface lands.

Affected spec files:
- `e2e/personas/driver.spec.ts` — delivery + pickup loop
- `e2e/personas/technician.spec.ts` — pick-up + transition flow
- `e2e/personas/dispatcher.spec.ts` — bulk + route + permission
- `e2e/personas/ops-manager.spec.ts` — dashboards + read/write
  matrix per route
- `e2e/personas/warehouse.spec.ts` — bench + scan + scheduling
- `e2e/personas/read-only.spec.ts` — read everything, mutate
  nothing (depends on B8)
- `e2e/personas/admin-destructive.spec.ts` — destructive walk
  (one smoke test stays active: Alex reaches /admin/users/[id])
- `e2e/persona-warehouse.spec.ts` — R11 stub superseded by the
  R13 personas/ counterpart
- `e2e/route-smoke.spec.ts` — R13 §1E theme/route smoke matrix
- `e2e/block-create.spec.ts` — depends on people-row data-testid

The structural sitemap-coverage gate at
`tests/round-11/route-smoke-coverage.test.ts` continues to
protect against the /tickets SSR class of regression at the
vitest layer.

## B15 — /my-day light-mode contrast in OPS ATTENTION cards (DEFERRED)

The R13 §1E contrast sweep (e2e/contrast-sweep.spec.ts) found a
single sub-4.5:1 contrast violation: `/my-day` in light mode,
gray text in the OPS ATTENTION cards or a similar muted state.
The other 23 (page × theme) combinations pass.

R14 entrypoint: bump the muted-text rgba in light mode so the
12-page floor reaches AA. The test is annotated test.fixme()
with the B15 reason inline; remove the conditional fixme once
the rgba bump lands.

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

---

## R13 security pass — newly deferred (in scope of the R13 prompt)

These items were listed in the R13 security and correctness pass
but did not ship in this round. Each documents the trigger / blocker
for graduation.

- **B16 — §1F synthetic-merge import reconciliation idempotency
  keys.** The eventual-consistency boundary is documented in
  `docs/round-13-assumptions.md` but the idempotency keys on
  runner-up comments + `failed_merge` audit rows are not yet
  written. Filed for R14: trivial code change, no schema delta.
- **B17 — §2A full conversion to `*ForSession` helpers.** R13
  ships the helpers and converts `/api/search` (§1C) +
  `/api/attachments/[id]` (§1D). Remaining hot paths land in R14
  (CSV exports, `/bench`, `/dashboards/*`, `/notifications`).
  ADR 0014 records the conversion roadmap.
- **B18 — §2B `lib/humanise.ts` becomes the implementation.**
  Current re-export shape is acceptable; the truthfulness fix is
  the grep-gate enforcement which already holds. R14 entrypoint:
  move implementations into `lib/humanise.ts` once the call-site
  audit confirms no consumer imports from `lib/format` directly
  for new code.
- **B19 — §2C internal-link `incidentNumber` sweep.** Search
  results (§1C) updated. Remaining sites (returnTo, audit chip
  click-through, notification list, email templates) follow in
  R14.
- **B20 — §2E manager bench query cap + cursor-pagination
  decision.** Trigger: tickets > 5,000 OR p95 list-render >
  800ms. Until then, offset pagination is acceptable.
- **B21 — §2F email queue idempotency comment fix.** Comment
  update + provider-level idempotency keys filed for R14.
- **B22 — §2G schema FK + index cleanup migration.** Soft FKs
  remain on `DistrictUser` index, `UserPreference` cascade,
  `PortalRequest` relations.
- **B23 — §2I render-invariant tests.** Component-render tests
  for high-leak surfaces (audit row, kanban card, palette,
  role chip). Grep-gate freeze is in effect; new leaks ship
  with render tests.
- **B24 — §2J Round-N comment cleanup.** Round history stays in
  source comments for R13; sweep deferred. ADRs and round-NN
  summary docs remain the authoritative history.
- **B25 — §2K persona suite golden-path un-fixme.** 7 persona
  spec files exist; un-fixme'ing one per persona deferred to
  R14 once the matching surface assertions stabilise.
- **B26 — §3A Ops Exceptions dashboard.** New `/admin/exceptions`
  page with 6 sections (failed email jobs, failed synthetic
  merges, orphan StopDevice rows, stuck imports, near-expiry
  portal tokens, anomalous sign-ins). Filed for R14 as the
  reviewer's recommended new feature.
- **B27 — §3B audit wave 5 spec.** Partial: every R13 mutation
  uses the new column schema. Full coverage spec deferred.
- **B28 — §3C CI fail-on-skip enforcement.** Current CI runs all
  unit tests; integration tests skipped without `DATABASE_URL`
  do not fail the build. Filed for the CI hardening pass.
- **B29 — Per-session `jti` for fine-grained revocation.** R13
  §1A ships coarse `sessionRevokedBefore`. Per-session `jti`
  unblocks "Sign out THIS device" affordance per row. ADR 0015
  records the alternative.
- **B30 — Audit `ipHash` column on AuditLog.** Mentioned in
  the §1J prompt; deferred until anomalous-sign-in feature
  requires it. Current sign-in audit row already carries the
  IP via the `before/after` JSON.
- **B31 — Provider-level email idempotency key.** The §2F
  comment fix surfaces a real duplicate-send window that
  exists for high-volume queues. Add a provider-level `Idempotency-Key`
  header (Resend supports it natively) once the worker design
  is ready.
