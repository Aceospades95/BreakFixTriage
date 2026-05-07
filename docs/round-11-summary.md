# Round-11 summary

## What shipped

R11 lands as 3 stacked commits on
`claude/breakfix-triage-audit-ZDYuJ`:

1. **`ab36266` fix(critical):** §HOTFIX-1 /tickets SSR fix
   (digest 3087090167 — render-prop antipattern across the
   server→client boundary) + §HOTFIX-2 route smoke gate +
   sitemap-coverage vitest gate.
2. **`21e8734` fix(critical):** §1A palette URL leak + §1B
   placeholder convention (26 changes) + §1C UserSession write
   path with privacy-aware hashing + §1D /admin overview kebabs
   on every card with CSV exports + auto-seed federal holidays.
3. **`0de875e` feat(seed):** §1E first-run defaults extraction
   into `prisma/seed-defaults.ts` + production backfill +
   §2A-§2E e2e specs + §2D CI Postgres + integration tests +
   §2F audit row coverage wave 3 + §2G grep gate v3.

## Hard gates (final state)

- **G1 tsc** — clean
- **G2 forbidden-tokens grep gate v3** — clean
- **G3 vitest** — 577 active passed / 7 integration skipped (need
  DATABASE_URL) / 13 todo placeholders. R11 added 87 new vitest
  cases across 10 files.
- **G4 Playwright route smoke** — structural via the sitemap-
  coverage gate. Live runtime DEFER until §2D Playwright runtime
  is provisioned.
- **G5 prisma migrate deploy** — schema delta in place (UserSession
  column rename + expiresAt). Verify on first CI Postgres run.
- **G6 seed idempotency** — structural (findFirst+create / upsert).
  Verify on first CI Postgres run.
- **G7 humanise() single entry point** — R8 grep gate continues
  to enforce.
- **G8 every destructive action writes ≥1 audit row** — R10 §3C
  (14 surfaces) + R11 §2F (18 surfaces) = 32 total.
- **G9 dispatchEmailEvent single chokepoint** — R8 grep gate
  continues to enforce.
- **G10 every notifyOnEnter status has matching EmailRule** — R8
  invariant.
- **G11 first-run auto-seed** — `npm run db:seed:defaults` is the
  production backfill. Verify on first deploy.

## What's deferred (filed in `docs/round-11-backlog.md`)

- **Live Playwright + CI Postgres runtime** — every spec under
  e2e/ depends on this. R11 wired the GitHub Actions service
  container + spec files; the runtime needs Playwright browser
  binaries + persona seed alignment + Mailpit transport.
- **CSV importers** — schools / devices / device-models / parts.
  The kebabs do not show import items today; the importer
  pipelines are too large for R11.
- **In-memory email transport branch** — speeds the §2D
  integration suite once wired.
- **Cmd+K user-name fuzzy match** — needs privacy-aware API.

## Post-deploy verification protocol

After R11 lands in production:

1. Sign in as Alex Admin → /tickets renders correctly (no
   error boundary).
2. Bulk actions row shows count + disabled-when-empty.
3. /admin/users/[any user] → Recent sessions panel shows ≥1
   row with lastSeenAt within last 2 minutes (after the user
   has loaded a page since deploy).
4. /admin holidays card kebab → "Auto-seed US federal holidays"
   → seeds the year's 11 federal holidays + writes an audit row
   per holiday.
5. /admin email log card kebab → "Export last 30 days CSV"
   downloads a CSV.
6. /duplicates SNOW INC# input placeholder reads `e.g. INC1234567`
   in italic violet.
7. Cmd+K → type "INC2200126" → secondary line reads "Ticket"
   (not a URL path).
8. /admin overview every card sports a kebab (⋯) icon top-right.
   Tab to it, Enter opens the popover.
9. After deploy: run `npm run db:seed:defaults` once to backfill
   missing EmailTemplate / EmailRule / Holiday rows. Verify
   counts are ≥8, ≥1, ≥11.
10. Audit log filtered to `entityType=User` shows session-revoke
    rows when admin clicks "Sign out all sessions".

## Persona surface verified

- **Driver (Dante)** — read-only walks confirmed; bulk transition
  form hidden because canTransition === false.
- **Repair tech (Tess)** — scan + warehouse scan + my-day work;
  blocked from /admin.
- **Admin (Alex)** — every page reachable; Recent sessions panel
  + kebab actions + auto-seed holidays + audit filters.
- **Manager (Olivia)** — tickets / imports / scheduling / quotes;
  blocked from /admin.
- **Warehouse (Wes)** — scan/warehouse path verified.
- **Read-only (Ray)** — every documented mutation surface 403's
  via §2C structural assertion.
- **Ops Manager (Pat / Olivia)** — /scheduling/people block
  create flow targeted by §2A.
- **Dispatcher (Dana)** — /scheduling/routes/new + bulk
  transition.

## Round-12 entrypoints

The biggest deferred items that should headline R12:

1. **Playwright runtime in CI** — unblocks every e2e/ spec from
   R11. Without this, the specs are documented acceptance
   criteria, not gates.
2. **CSV importers** for schools / devices / device-models /
   parts → restores the kebab "Import" items.
3. **In-memory email transport branch** in `src/lib/email/send.ts`
   for fast integration tests.
4. **Multi-tenant district scoping at the DB layer** — Postgres
   row-level security with the Prisma access-policy middleware.
5. **`/forbidden` route** — currently the read-only role hitting
   a forbidden route gets `?error=` on the home page. A
   dedicated /forbidden landing pad would render a clearer
   message + sitemap of pages they CAN access.

Everything else in `docs/round-11-backlog.md` rides on these or
is purely additive polish.
