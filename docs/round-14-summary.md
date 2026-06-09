# Round-14 summary

Full-project review against a live runtime (Postgres 16 + production
`next build` + Playwright Chromium). The defining fact of this round:
**every prior e2e spec was `test.fixme()`'d** ("blanket-fixme every
active spec until live runtime is verifiable", commit `c93c0a4`) —
the suite reported 140 skipped / 0 run. Round-14 stood the runtime
up, re-activated the suite, and fixed everything it caught.

## Hard gates (final state)

- **G1 tsc** — clean.
- **G2 forbidden-tokens grep gate v5** — clean.
- **G3 vitest** — 853 active passing (was 845); 4 structural pins
  updated to match Round-14 behavior changes.
- **G4 Playwright** — re-activated: 140 of 141 tests run against a
  live server (1 remains fixme: Mailpit-gated notification dispatch,
  B12). Includes the 49-route smoke matrix, 18 read-only enforcement
  cases, 24 contrast cases, 7 R11 + 7 R13 persona walks, theme
  picker, 2FA reset, not-found chrome, and PTO block-create.
- **G5 prisma migrate deploy** — no schema delta this round.
- **G-integration** — 19 passing against live Postgres (was 11): the
  state-machine and import-dedupe specs are now real tests instead
  of `it.todo` stubs.

## Authorization wave (graduates backlog B8) — ADR 0017

- **`requireRole` redirects to `/forbidden`** instead of throwing
  into the error boundary. In production the boundary could never
  recognise authorization errors (Next.js scrubs server error
  messages), so every denial rendered "Something went wrong".
- **New chromed `/forbidden` page** showing identity, role, and the
  missing permission in a `<code>` chip.
- **`/invoices` read gate fixed** — demanded `TICKETS_WRITE` for a
  read surface; READ_ONLY was locked out of a documented read page.
  Now `QUOTES_READ`, with writes still gated by `canWrite` + the
  server actions' own `QUOTES_WRITE` checks.
- **`/admin` layout gate fixed** — demanded `USERS_MANAGE` for the
  whole segment, locking OPS_MANAGER out of `/admin/email-log` and
  `/admin/email-templates` despite holding the documented
  `EMAIL_WRITE` grant. The layout now admits either permission and
  the admin sidebar renders only links the role can open.

## Bugs found by the re-activated suite

| # | Finding | Fix |
|---|---------|-----|
| 1 | `db:seed:test` crashed with a P2002 unique violation when run after `db:seed` (device-model upsert keyed on a hardcoded id, not the `(manufacturer, modelName)` unique) | upsert on the compound unique |
| 2 | `/scheduling/routes` deliberately 404'd (Round-6 placeholder) while docs/sitemap.md documented it as a view | real route index page: filter pills with counts, paged table, Build-route CTA |
| 3 | Unmatched URLs rendered Next's bare default 404 — route-group `not-found.tsx` only catches thrown `notFound()` | new root `src/app/not-found.tsx`, standalone chromed 404 (anonymous-safe for bad portal links) |
| 4 | B15 "contrast violation" on /my-day light mode was a test race — /my-day redirects to `/` and the measurement raced the navigation | spec follows the redirect; all 24 contrast cases pass with no rgba change needed |
| 5 | seed-test.ts header promised "1 route, 1 quote" since R12 but never created them; tickets had no linked devices | seed now creates the route (2 pickup stops + StopDevice rows for Dante) + a SENT quote, and links each ticket to its school-aligned device |
| 6 | theme-picker spec: 100ms *click* timeouts + a save assertion that no-ops when the persona's saved theme is already the clicked one | click timeouts removed (flip assertion stays tight), save test forces a real dark→light change |
| 7 | `@playwright/test` floated (`^1.48.0`) to 1.59 while the environment ships browser build 1194 | pinned 1.56.0 (matches 1194) |

## Backlog graduations

- **B8** — /forbidden + requireRole redirect (ADR 0017).
- **B14** — persona spec aspirational coverage: test hooks wired
  (`people-row`, `people-add-block-form`, `block-segment`,
  `available-transitions`, `route-stop` + `data-stop-id`); all
  persona specs un-fixme'd; route-smoke migrated to the JWT helper.
- **B15** — closed as test-bug (see table above).
- **B16** — synthetic-merge idempotency: `reconcileSnowImport`
  side-effects (runner-up / cross-school / failed-merge comments +
  audit rows) are now keyed on `(ticket, action, importBatchId)` via
  the audit row's `after.importBatchId`, so importer retries don't
  duplicate them.
- **Integration todos** — the R11 §2D "coverage targets" were
  `it.todo` stubs naming states that don't exist in the taxonomy
  (OPEN/IN_PROGRESS/ON_BENCH/RESOLVED). Real specs now walk real
  edges: legal chain + TicketEvent/audit writes, illegal-edge
  rejection, requireJobForScheduled guard, force-bypass with
  warn-severity audit; import dedupe covers open-INC update,
  closed-INC DuplicateConflict, and synthetic auto-merge.

## Polish

- `RouteStatusPill` extracted to `src/components/route-status-pill.tsx`
  (was duplicated inline in /scheduling and the route detail page;
  the new routes index is the third consumer).
- Admin sidebar is permission-aware (no dead links for ops managers).

## Deferred / unchanged

- **B12 Mailpit fixture** — `notification-dispatch.spec.ts` and the
  4 dispatch-email-event integration cases stay gated on an SMTP
  sink in CI.
- **B13 audit string normalisation** — still deferred; the Round-14
  audit re-confirmed the mixed formats (`transition:*`, dotted,
  colon-prefixed) but a rewrite + historical migration stays a
  dedicated round.
- **B9 axe-core walk, B5/B6 CSV importers, B11 /people directory,
  B17 *ForSession conversion** — carried forward in
  docs/round-14-backlog.md.
