# Round-11 backlog — carried forward + new

## Inherited from Round-10

These were filed in `docs/round-10-backlog.md`. R11 status:

### Graduated in R11

- ✅ §1F live ip/UA capture middleware → R11 §1C touchSession
- ✅ §2B /admin overview kebab menus → R11 §1D AdminCardKebab
- ✅ §2C /scheduling/people block create Playwright spec → R11 §2A
- ✅ §3A live integration tests → R11 §2D infrastructure
- ✅ §3B persona-walked Playwright suite → R11 §2E (7 specs)
- ✅ §3D notification dispatch e2e → R11 §2B
- ✅ §3E read-only API-level 403 tests → R11 §2C

### Still open from R10

- **CI Postgres + Playwright runtime provisioning** — R11 wired
  the GitHub Actions service container + the spec files. The
  runtime still needs:
  - Playwright browser binaries on the runner image
  - `npx playwright install` step in CI
  - `playwright.config.ts` with the dev-server `webServer` block
  - Persona seeding for the test users (Alex, Olivia, Dana, Tess,
    Wes, Dante, Ray) at known emails / passwords
  - Mailpit container actually wired into a working SMTP transport
  - **R12 entrypoint #1**

- **CSV imports for schools / devices / device-models / parts** —
  the R11 brief asked for kebab actions on the admin overview,
  but the importer pipelines were too large to ship in R11. The
  kebabs do NOT show import items today.
  - Need: shared CSV upload form + Papa-parse pipeline + dedupe
    rules per entity + audit row per import row + import-history
    page like /imports for tickets
  - **R12 entrypoint #2**

## New in R11 (deferred to R12)

- **In-memory email transport branch** — `src/lib/email/send.ts`
  always goes through nodemailer. The §2D integration tests
  benefit from `EMAIL_TRANSPORT=memory` for fast unit tests, but
  the branch isn't wired yet. Filed in `docs/round-11-email-fixtures.md`.

- **§2A audit action name `staffschedule.create`** — brief asked
  for that exact form; the existing code uses `staff.schedule.created`
  which carries the same semantics. Pre-R11 audit rows would be
  orphaned by a rename, so we kept the existing form. Future
  rename can ship via a migration that rewrites historical rows.

- **/admin/permissions: View role matrix kebab action** — the
  /admin/permissions page IS the role matrix. Kebab links to it.
  A future enhancement could open an inline matrix preview as a
  modal on the /admin overview without navigation.

- **Cmd+K user-name fuzzy match** — still deferred from R10. The
  privacy-aware "search users by name without leaking emails to
  non-admins" API is the gating piece.

- **Live e2e + Playwright runtime ASSERTION (vs structural)** —
  every spec under e2e/ that depends on §2D. The structural
  assertions in `tests/round-11/*.test.ts` are the substitute
  until Playwright runs.

- **Mailpit in dev hosts** — currently developers run
  `docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit:latest`
  by hand. A docker-compose.local.yml would streamline.

## Round-3 carry-forwards (still open)

- **/admin/audit retention policy + auto-purge** — configurable
  in /admin/settings. R11 still doesn't have it.
- **Multi-tenant district scoping** — every query filters by
  `user.districts` membership at the route level only. DB-level
  RLS or a `where: { districtId: { in: user.districts } }` clause
  in every query is the durable answer.
- **SSO / SAML / OIDC integration** — Google OIDC works; full
  SAML / OIDC providers don't.
- **Mobile-responsive layouts for /scan, /bench, /tickets/[id]**
  — works on desktop; mobile is awkward.
- **Real-time websocket for /tickets/kanban** — currently 30s
  poll; live updates would replace the auto-refresh widget.
- **PDF export for work orders + quotes** — print-only today.
- **Bulk import for StaffSchedule blocks** — one-at-a-time today.

## Round-12 entrypoints

The biggest deferred items that should headline R12:

1. **Playwright runtime in CI** — unblocks every e2e/ spec
   shipped in R11. Without this, the specs are documented
   acceptance criteria, not gates.
2. **CSV importers for schools / devices / device-models / parts**
   — the kebabs assume importers exist; ship the importers.
3. **In-memory email transport branch** — speeds the §2D
   integration suite.
4. **Multi-tenant district scoping at the DB layer** — RLS is the
   right primitive; investigate Postgres row-level security with
   the Prisma access-policy middleware.
