# Round-13 summary

## What shipped

R13 lands as 2 stacked commits on
`claude/breakfix-triage-audit-ZDYuJ`:

1. **`64212b6` fix(sidebar):** §1A /people redirect + §1B-§1D
   enum/token leak fixes + §1E + §2A-§2G + §3A-§3H + §4A-§4E.
2. **`<this commit>` docs(round-13):** decisions + backlog +
   qa-checklist + summary.

## Hard gates (final state)

- **G1 tsc** — clean
- **G2 forbidden-tokens grep gate v5** — clean. 2 new sub-rules:
  parens-enum (catches `(AWAITING_ONSITE)` in JSX text),
  snake-case-token (catches `school_spoc` in JSX text outside
  `<code>`).
- **G3 vitest** — 750 active passing / 7 integration skipped
  (need DATABASE_URL) / 13 todo. R13 added 54 new vitest cases
  across 4 files.
- **G4 Playwright** — 7 new persona specs + contrast sweep
  spec; runs under §1E runtime.
- **G5 prisma migrate deploy** — no schema changes this round.
- **G6 verify-deploy** — extended to ping /api/health and emit
  a one-line "Round-13 health: OK" / "FAIL — N failure(s)".
- **G7 7 persona Playwright spec files** — driver, technician,
  dispatcher, ops-manager, warehouse, read-only,
  admin-destructive.
- **G8 read-only role API hardening** — read-only spec walks 5
  export endpoints + asserts 401/403; structural test pins the
  17 mutation surfaces.
- **G9 audit row coverage wave 4** — every persona spec asserts
  audit-row writes for destructive actions.
- **G10 routes manifest** — `assertSidebarHrefsAreKnownRoutes`
  covers §1A; 50+ documented routes.
- **G11 production seed-state** — no change from R12.
- **G12 R12 regression suite** — `npx vitest run tests/round-12/`
  still green.

## Critical fixes

- **§1A** — `/people` shortcut now resolves (308 → /scheduling/people).
  Not a sidebar bug per se (sidebar already pointed at the
  correct path) but a usability fix: operators who type the
  natural URL get there. Routes manifest records the redirect.
- **§1B** — CHANGE STATUS (ADMIN) <option> drops the
  "(AWAITING_ONSITE)" enum suffix. Raw enum exposed via
  `data-state-key` for tests/devs.
- **§1C** — /my-day TEAM QUEUES persona cards humanise role via
  `formatRole(user.role)`.
- **§1D** — /admin/email-rules Recipients + Template columns
  wrap each token (`school_spoc`, `ticket_created`, etc.) in a
  `TokenChip` `<code>` pill so tokens read as developer
  strings.
- **§1E + §4C** — `e2e/contrast-sweep.spec.ts` walks 12 pages
  × 2 themes (24 cases). Asserts data-theme-resolved is never
  "pending" + body contrast ≥ 4.5:1 + sidebar nav contrast ≥
  4.5:1 (catches the §1G hotfix bug class). Theme forced via
  cookie injection — never via OS preference.

## Persona suite

7 new Playwright specs at `e2e/personas/`. Each uses the new
`signInAs(page, PERSONA.X)` helper that hits the NextAuth
credentials endpoint directly. Specs:

- **driver** — delivery + pickup loop, audit row attribution
- **technician** — pick-up + transition + admin-panel-hidden
- **dispatcher** — bulk-assign + route-build + permission scope
- **ops-manager** — dashboards + export + admin-blocked
- **warehouse** — bench + scan + scheduling-routes-new-blocked
- **read-only** — every read passes; every mutation blocked
- **admin-destructive** — reset 2FA + revoke sessions + audit

## Polish

- **§3A** — quotes filter pill counts as nested rounded-full
  chips with tabular-nums
- **§3B** — Aging > 30d card on /dashboards links to filtered
  /tickets; SLA breached card on /my-day links to filtered
  /tickets (was anchor-only)
- **§3C** — /invoices empty state migrated to new shared
  `<EmptyState>` component (CircleCheckBig SVG at slate-500;
  no emoji)
- **§3D** — verified /scheduling/people header reflects the
  navigated date (already-correct, server-rendered)
- **§3E** — admin kebab hit area expanded to 44×44 (h-11 w-11)
  for WCAG touch-target compliance
- **§3F** — /admin/email-rules "Seed example rule" button
  disables when ≥1 rule exists
- **§3G** — /admin/holidays empty-year state ships a "Seed
  {year} federal holidays" CTA; seed action accepts an optional
  year parameter (2000-2100)
- **§3H** — Recent sessions panel renders "Unknown device"
  fallback when both ipHash + uaFingerprint null. Full IP+ASN+OS+
  browser parser deferred to backlog as B8.

## Hardening

- **§4A grep gate v5** — parens-enum + snake-case-token
  sub-rules. Vitest fixtures verify each rule fails on a bad
  fixture and passes on a clean one.
- **§4B routes manifest** — `src/lib/routes-manifest.ts` is the
  single source of truth. ROUTES_MANIFEST + SIDEBAR_HREFS +
  `assertSidebarHrefsAreKnownRoutes()`.
- **§4C contrast Playwright** — `@contrast`-tagged spec, cookie
  injection, ratio ≥ 4.5:1 floor.
- **§4D sign-in-as helper** — `e2e/lib/sign-in-as.ts` +
  `e2e/README.md`. PERSONA constants for all 7 roles.
- **§4E verify-deploy** — pings /api/health + emits one-line
  Round-13 health summary.

## What's deferred

Filed in `docs/round-13-backlog.md`. Headline R14 entrypoints:

1. **Full axe-core contrast walk (B9)** — graduates the §1E
   floor to per-element WCAG 2.2 sweep.
2. **IP+ASN+OS+browser parser (B8)** — needs privacy review +
   schema change.
3. **CSV importers (B5 + B6)** — schools / devices /
   device-models / parts.
4. **/people graduation (B11)** — real directory page.
5. **Audit string normalisation (B13)** — `<entity>.<verb>`
   convention sweep + migration.

## Post-deploy verification protocol

After R13 lands in production:

1. Run `bash scripts/verify-deploy.sh` with `BASE_URL` +
   `COOKIE` env. Expect "Round-13 health: OK".
2. Sign in → click sidebar's "People" → land at
   /scheduling/people 200.
3. Type /people directly → 308 redirect to /scheduling/people.
4. /tickets/INC2200126 CHANGE STATUS (ADMIN) → option text
   shows only "Awaiting onsite" etc. Inspect HTML to confirm
   `data-state-key="AWAITING_ONSITE"`.
5. /my-day → TEAM QUEUES cards show "Technician" /
   "Ops manager" / etc., not the raw enum.
6. /admin/email-rules → Template + Recipients columns render
   each token in a `<code>` pill.
7. /admin/email-rules → "Seed example rule" button is disabled
   (because the seed migration already created one rule).
8. /admin/holidays?year=2025 → empty state shows a "Seed 2025
   federal holidays" button. Click → 11 holidays appear.
9. /admin overview → hover any card's top-right corner; the
   kebab hit area is 44×44 (test with a touch device).
10. /invoices empty → render the shared EmptyState (no emoji).
11. /dashboards → "Aging > 30d" card is a link to filtered
    /tickets. /my-day "SLA breached" card likewise.
12. /admin/users/[id] Recent sessions → if a session predates
    ip/UA capture, the row reads "Unknown device".

## Persona surface verified

- **Driver (Dante)** — read-only walks confirmed, audit-row
  attribution asserted in spec.
- **Repair tech (Tess)** — bench pick-up + audit row asserted.
- **Admin (Alex)** — destructive actions (reset 2FA, revoke
  sessions) all write audit rows.
- **Manager (Olivia)** — dashboards walks; admin-write surfaces
  blocked.
- **Warehouse (Wes)** — scan + bench affordances visible;
  /admin + /scheduling/routes/new blocked.
- **Read-only (Ray)** — every documented mutation surface
  blocked; export endpoints 401/403.
- **Dispatcher (Dana)** — bulk + routes + permission scope.

## Files touched

- 1 new redirect page (/people)
- 4 modified app pages (my-day, email-rules, holidays, invoices,
  quotes, dashboards, force-change-form, admin-card-kebab,
  users/[id])
- 7 new persona specs + 1 contrast spec + 1 sign-in-as helper +
  1 e2e README
- 1 new EmptyState component + 1 new routes manifest
- 4 new tests/round-13/ files (54 new cases)
- 4 new docs files (decisions + backlog + qa-checklist + summary)
- Modified scripts/check-forbidden-tokens.sh + scripts/verify-deploy.sh
