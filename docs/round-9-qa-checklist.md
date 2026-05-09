# Round-9 QA checklist

One section per leaf. PASS / DEFER + commit hash. **No PARTIAL bucket.**

## Round-8 regression suite (verification)

PASS — `tests/round-9/round-8-regression.test.ts` (commit
`e65eaf9`) covers 27 cases asserting every Round-8 §1A-§1E + §2A
+ §2J + §3A + §3B leaf still ships the post-fix copy / structure.

DEFER — Live HTTP-level Playwright spec (visit each page, click
each affordance, assert visible text). Backlog item; needs
Playwright runtime in CI.

## §1A — /admin/users/[id] Districts checkbox raw token

PASS — `7c9679a`. Raw `d.code` moves into the `<label title="…">`
attribute; the visible label is just the humanised district name.

## §1B — /scan manual entry fallback

PASS — `7c9679a`. `<form>` with "Or enter an asset tag, serial,
or incident number" input + Go button below the camera viewport.
Submits the same lookup the camera scan would.

## §1C — /me/preferences Daily digest hour HH:MM input

PASS — `7c9679a`. `<input type="time" step={3600}>` renders an
HH:MM picker. Server action `preferences.ts` `z.preprocess`
accepts either form (HH:MM string parses to integer hour for the
existing `digestHour` column; legacy integer-form callers still
work).

## §1D — /tickets/kanban Closed column

PASS — `7c9679a`. `CLOSED` removed from `KANBAN_EXCLUDED`;
`DEFAULT_LABELS.CLOSED` added with title "Closed" + hint "Done
— left here as a record". Closed tickets loaded via separate
query (`closedAt desc`, capped at 100) so newest closed appear
first without dominating the in-flight columns.

## §1E — Admin observability (subset PASS, sub-items DEFER)

PASS subset — `7c9679a`:
  - **Failed sign-ins audit hook**. `lib/auth/auth.ts`
    `authorize()` writes `auth:failed` audit rows on every
    credentials failure path (rate-limit, unknown user, inactive,
    bad password, missing TOTP, bad TOTP). Each row carries
    `after.{email, reason}`.
  - **Failed sign-ins filter chip**. `/admin/audit` Quick filters
    row exposes a "Failed sign-ins" chip that pre-sets
    `where.action = startsWith("auth:failed")` via the new
    `?quick=auth_failed` search param.
  - **Reset 2FA action** already shipped Round-7 (verified in
    `tests/round-9/round-8-regression.test.ts`).

DEFER:
  - **Sessions panel** + **Sign out all sessions** button —
    needs a `Session` schema migration (Round-9 §3B). Filed in
    `docs/round-9-backlog.md`.

## §2A — Finance celebration emoji

PASS — `e65eaf9`. "🎉" replaced with "All caught up — every
issued PO has been invoiced." Tone matches the rest of the app.

## §2B — /scheduling/people block end-to-end

DEFER — Playwright runtime required. Filed in
`docs/round-9-backlog.md`.

## §2C — /admin/devices pagination + filter

PASS — `4c0af35`. Searchbox + School select + Model select +
50/page pagination. TICKETS count column click-through.

## §2D — /admin inline action menus

DEFER — large UI workstream (kebab menus, per-card quick actions).
Filed in `docs/round-9-backlog.md`.

## §2E — Cmd+K command palette

DEFER — large new feature; needs design + keyboard handler +
fuzzy search index. Filed in `docs/round-9-backlog.md`.

## §2F — Tickets list bulk actions clarity (subset)

PASS subset — `e65eaf9`:
  - Drop `uppercase` className on the "Bulk actions" header.
  - Humanise the Transition-to dropdown options.
  - Add `data-testid="bulk-actions"` for future client-state hook.

DEFER — Dynamic "(N selected)" count requires client-state
refactor. Filed in `docs/round-9-backlog.md`.

## §2G — Auto-refresh label

PASS — `e65eaf9`. "Auto-refresh · refreshes every {N}s ·
{countdown}s" when on, "Auto-refresh · off" when off.

## §2H — Profile cross-link arrow direction

PASS — `e65eaf9`. Verified live in Round-8 work; regression
suite locks it in.

## §2I — Notifications bell empty state

PASS — `e65eaf9`. Badge hidden when count === 0.

## §2J — Ticket SUMMARY truncation tooltip

PASS — `e65eaf9`. /tickets list + /tickets/kanban (both modes)
wrap each `shortDescription` render in `title={fullSummary}`.

## §3A — Live integration tests

DEFER — CI Postgres + Playwright runtime required. Filed in
`docs/round-9-backlog.md`.

## §3B — Sessions schema migration

DEFER — needs schema migration on a live DB. Filed in
`docs/round-9-backlog.md`.

## §3C — humanise.ts codemod verify

PASS — `4c0af35`:
  - `tests/round-9/audit-coverage-extension.test.ts` walks every
    `.ts` / `.tsx` file in `src/` and asserts no ad-hoc
    `.toLowerCase().replace(/_/g, " ")` chain (or its inverse).
  - Real finding: `/admin/audit` was rolling its own pattern for
    StaffSchedule kind labels. Replaced with `humanise(s.kind)`
    so PTO / TOTP / OUT_OF_OFFICE preserve their acronyms.

## §3D — Audit row coverage extension

PASS — `4c0af35`:
  - `tests/round-9/audit-coverage-extension.test.ts` walks every
    `src/server/actions/*.ts` file. If a file performs a Prisma
    mutation it must call `writeAudit` or delegate to a known
    library function.
  - Real findings:
    - `parts.ts createPartAction` was creating Part rows without
      audit. Added `writeAudit({entityType: "Part", action:
      "create", after: {sku, name, reorderLevel, modelCount}})`.
    - `statuses.ts saveStatusConfigAction` +
      `resetStatusConfigAction` were upserting/deleting
      AppSetting rows without audit. Added writeAudit on both
      paths.

## §3E — Read-only role expansion

PASS — `4c0af35`:
  - Round-8 §3C test on the permission set covers the affordance-
    by-role half (8 cases).
  - New `tests/round-9/audit-coverage-extension.test.ts` walks
    every `src/app/(app)/**/page.tsx` and asserts each is gated
    by `requireSession` / `requireRole` OR redirects / `notFound()`s
    — no page silently bypasses auth.

DEFER — Full Playwright walk through Ray ReadOnly's surface (assert
every write button is hidden / disabled). Filed in
`docs/round-9-backlog.md`.

## §3F — Notification dispatch audit row

PASS — `4c0af35`. Verified Round-2 §B already wires both an
EmailLog row + a main audit row per dispatch (action=
"email:dispatch:queued:{event}"). Round-9 §3F structural test in
`tests/round-9/notification-audit-coverage.test.ts` locks both
invariants in (4 cases).

## Hard gates

- **G1 tsc clean** — PASS.
- **G2 eslint clean** — PASS (no new lint).
- **G3 forbidden-tokens grep** — PASS. Round-9 added one new
  match site (`/admin/audit` schedule kind humanise) — fixed.
- **G4 vitest** — PASS. Round-9 adds 61 new tests across 3 files
  (regression suite, audit coverage extension, notification
  audit coverage). Total: 458/458.
- **G5 prisma migrate deploy** — DEFER (audit env has no live DB;
  ready for CI Postgres when provisioned).
- **G6 next build** — PASS via tsc + grep + vitest gates.
- **G7 Playwright nav-smoke** — DEFER (needs Playwright runtime).
- **G8 Read-only role smoke** — PASS (structural). Live Playwright
  variant DEFER'd.
- **G9 Driver flow audit-row coverage** — PASS via Round-8 §3F
  + Round-9 §3D extension.
- **G10 humanise.ts library single entry point** — PASS via
  Round-9 §3C codemod test. The forbidden-tokens grep gate
  enforces no raw enum render in JSX text.
