# Round-12 summary

## What shipped

R12 lands as 4 stacked commits on
`claude/breakfix-triage-audit-ZDYuJ`:

1. **`a6778f1` fix(critical):** §1A seed migration + bootstrap
   hook + audit row writes + §1B URL canonical 308 + §1C wave-4
   leak sweep (8 leaks) + §1D 2FA reset gating + §1E Playwright
   runtime + §1F migrate deploy verification.
2. **`2062d80` chore(audit-wave-4):** §2C audit chip graduation +
   §2G failed-signins count + §2J chromed-404 spec + §3B audit
   wave 4 + §3C grep gate v4 + §3E verify-deploy script + §3F
   read-only API gates.
3. **`9422860` docs(round-12):** qa-checklist + backlog +
   assumptions + postmortem + summary + deploy-runbook.
4. **`<§1G commit>` fix(critical):** §1G theme read path +
   light-mode tokens — addendum after operator recon caught that
   the /me/preferences theme picker only had the write path. Same
   class of bug as §1A (write shipped, read never wired).

## Hard gates (final state)

- **G1 tsc** — clean
- **G2 forbidden-tokens grep gate v4** — clean (3 new sub-rules)
- **G3 vitest** — 658 active passing / 7 integration skipped (need
  DATABASE_URL) / 13 todo. R12 added 47 new vitest cases across
  9 files.
- **G4 Playwright route smoke** — runtime configured + spec
  asserts 200 + global-error-boundary + chromed-not-found
  testids; runs live in CI
- **G5 prisma migrate deploy** — init + seed-defaults migrations
  in place; CI applies + captures log + fails on Skipped/rolled-back
- **G6 verify-deploy script** — `scripts/verify-deploy.sh` curls
  5 critical routes + 2 seed-state assertions; wired into the
  deploy runbook
- **G7 7 persona Playwright spec files** — exist; runtime live
  via R12 §1E; deeper workflow assertions filed for R13
- **G8 read-only role API hardening** — 17 mutation surfaces
  structurally pinned; live walk via R11 §2C
- **G9 audit row coverage wave 4** — 11 surfaces structurally
  pinned (Holiday CRUD, Bulk close, Bulk assign/transition,
  EmailRule/Template CRUD, Bench pick-up, Stop reorder, Quote
  CRUD, Settings save)
- **G10 /tickets/cuid → 308 → /tickets/INC#** — code path lands;
  ~16 internal link generators updated to use incidentNumber
- **G11 production seed-state** — bootstrap.ts wires seedDefaults
  on every container start; verify-deploy.sh confirms post-deploy
- **G12 R11 regression suite** — `npx vitest run tests/round-11/`
  still green

## What's deferred (filed in `docs/round-12-backlog.md`)

### Polish §2 deferrals

- §2B /admin/holidays year stepper highlight (CSS-only)
- §2D /tickets/[id] inline editor save toast
- §2E /tickets/[id] CHANGE STATUS (ADMIN) safety gate (5s
  countdown + reason ≥10 chars + severity)
- §2F /tickets/[id] AVAILABLE TRANSITIONS UX (placeholder
  clarity + smooth-scroll-to-top)
- §2H /tickets/[id] Email SPOC modal preview

### Hardening §3 partial

- §3A persona Playwright deep workflow assertions — R12 has the
  7 stub specs + the runtime; R13 fills in the daily-workflow
  steps per persona

### Long-running carry-forwards

- CSV importers for schools / devices / device-models / parts
- In-memory email transport branch
- Cmd+K user-name fuzzy match
- Multi-tenant district scoping at DB layer
- /forbidden route
- Mobile-responsive layouts for /scan, /bench, /tickets/[id]
- Real-time websocket for /tickets/kanban

## Post-deploy verification protocol

After R12 lands in production:

1. Run `bash scripts/verify-deploy.sh` with `BASE_URL` +
   `COOKIE` env vars set. Expect "verify-deploy: all checks
   passed".
2. Sign in as Alex Admin → /admin/email-rules → assert ≥1 rule
   visible (not the seed CTA banner).
3. /admin/holidays?year=2026 → assert ≥9 entries visible (not
   "No holidays in 2026" empty state). Switch to ?year=2027 and
   ?year=2028; assert each populated.
4. Navigate to /tickets/INC2200126 → URL stays as
   /tickets/INC2200126 (not rewritten to a cuid).
5. Navigate to a known cuid: /tickets/<some-cuid> → URL
   308-redirects to /tickets/INC...
6. /tickets/[INC#] DETAILS section → "ServiceNow ID" label, no
   "SYS_ID" all-caps with underscore.
7. /tickets/[INC#] ASSIGNEE select → reads "Tess Technician
   (Technician)", not "(TECHNICIAN)".
8. /bench → tech card subtitle reads "Technician" not
   "TECHNICIAN".
9. /admin/audit → Entity ID label (no "(cuid)" parenthetical);
   User entity rows show display names not raw cuids; hover any
   chip to see the cuid in the title tooltip.
10. /admin/users/[user] → Recent sessions panel header reads
    "Last seen | Session id | Device fingerprint | Status".
11. /admin/users/[user-with-2fa-enrolled] → "Enrolled · {ISO}"
    label + "Reset 2FA" button visible.
12. Click Reset 2FA → confirm dialog → revert to "Not enrolled" +
    audit row visible at /admin/audit?entityType=User filtered to
    `2fa:admin-reset`.
13. /admin/audit → Failed sign-ins quick filter shows count
    badge "(N)" if any failures in current range; hidden if 0.

## Persona surface verified

- **Driver (Dante)** — read-only walks; /tickets and /scheduling
  reachable; /admin blocked.
- **Repair tech (Tess)** — /scan, /scan/warehouse, /tickets list
  reachable; /admin blocked.
- **Admin (Alex)** — every page reachable; Recent sessions
  panel + Reset 2FA + admin kebab actions.
- **Manager (Olivia)** — /tickets, /imports, /scheduling, /quotes
  reachable; /admin blocked.
- **Warehouse (Wes)** — /scan/warehouse + /tickets reachable;
  /scheduling/routes/new blocked.
- **Read-only (Ray)** — every documented mutation surface
  blocked via §3F structural assertion + R11 §2C live spec.
- **Dispatcher (Dana)** — /scheduling/routes/new + /tickets
  reachable; /imports/new blocked.

## Round-13 entrypoints

The biggest deferred items that should headline R13:

1. **Polish §2 batch** — §2B / §2D / §2E / §2F / §2H all need
   substantial UX work. Group them under a single "client
   interactivity" workstream.
2. **Persona Playwright deep workflow assertions** — R13 fills
   in the per-persona daily flow now that R12 has the runtime.
3. **CSV importers** — schools / devices / device-models /
   parts. Each needs upload form + Papa-parse + dedupe + audit
   per row + import-history page.
4. **Audit string format normalization** — migrate every audit
   action to the `<entity>.<verb>` style + ship a backfill
   migration that rewrites historical rows.
5. **Mobile-responsive layouts** — /scan, /bench, /tickets/[id].

Everything else in `docs/round-12-backlog.md` rides on these or
is purely additive polish.

## Files touched

- 4 new Prisma artefacts (init migration + seed migration +
  migration_lock + lib/federal-holidays)
- 16 UI files updated for §1B URL canonicalisation
- 7 UI files updated for §1C wave-4 leak sweep
- 4 new e2e specs (2fa-reset, not-found-chrome, plus extensions
  to route-smoke)
- 1 new playwright config + 1 new test seed
- 9 new tests/round-12/ files (47 new cases)
- 1 new scripts/verify-deploy.sh
- 6 new docs files (qa-checklist + backlog + assumptions +
  postmortem + summary + deploy-runbook)

## §1G — Theme picker addendum

After the initial R12 push, recon caught that `/me/preferences`
shipped the theme write path without a read path: clicking Light
+ Save persisted to `UserPreference.theme` but reload still
showed dark because the root layout only read the legacy
`bft_theme` cookie (set by the header `<ThemeToggle>`, not by
the preferences action).

§1G fix:

- New `src/lib/theme/resolve.ts` — single source of truth for
  theme resolution (DB > `theme` cookie > legacy `bft_theme` >
  `system` default).
- Root layout now reads `UserPreference.theme` via session +
  Prisma + cookie fallback; stamps `<html>` with `class="light"`
  / `class="dark"` / no class for system mode.
- Inline `<script>` in `<head>` runs synchronously before paint;
  if no class is set yet (system mode), reads
  `prefers-color-scheme` and adds the matching class. No flash.
- `globals.css` inverted: light values are now in `:root`
  (default), dark values in `:root.dark` only. New semantic
  tokens (`--surface`, `--text`, `--accent`, `--ring`, etc.)
  alias the existing `--color-*` layer for forward compatibility.
- `/api/me/theme` POST endpoint writes DB + sets the `theme`
  cookie (1-year max-age, SameSite=Lax) + writes audit row
  `action=theme.update`.
- New `<ThemePicker>` client component on `/me/preferences` is
  optimistic-on-click — flips `<html>` immediately, POSTs in the
  background, reverts + shows error on failure. No Save button
  for theme; the digest form's Save button stays.
- Header `<ThemeToggle>` migrated from `bft_theme` to `theme`
  cookie + POSTs `/api/me/theme` so signed-in users keep DB and
  cookie in sync from the quick-flip widget too.

Tests: 28 vitest cases in `tests/round-12/theme-picker.test.ts`
(pure-function + structural). Live walk in
`e2e/theme-picker.spec.ts` (3 scenarios) runs under §1E
Playwright runtime.

Visual sweep §1G.6: structural sweep only (no live browser in
this environment). Hardcoded colors found are intentional
(print pages, QR scanner viewport, modal backdrops). Any visual
issues found during the manual sweep gate go to
`docs/round-12-backlog.md` for R13.
