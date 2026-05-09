# Round-12 assumptions

Things the R12 brief did not explicitly specify, where Claude
Code made a judgment call.

## A1 — Branch name

Brief asked for `round-12/auto-seed-backfill-and-leak-sweep`.
Harness rules require all development on
`claude/breakfix-triage-audit-ZDYuJ`. Treated the brief's branch
name as an informational chapter label. Same precedent as R10/R11.

## A2 — Auto-seed migration vs bootstrap hook

Brief asked: "Convert npm run db:seed:defaults into an idempotent
Prisma migration that runs on every prisma migrate deploy."

Production today uses `prisma db push --skip-generate` (not
`migrate deploy`) per the Dockerfile CMD. So a Prisma migration
alone wouldn't fire on production deploy.

Decision: **ship both paths**.

1. `prisma/migrations/20260507000001_seed_defaults/migration.sql`
   — for environments using `prisma migrate deploy` (CI, future
   migration when production switches to migrate deploy).
2. `prisma/bootstrap.ts` calls `seedDefaults(prisma)` — runs on
   every container start regardless of which schema-apply path
   is in use.

Both paths converge on the same idempotent row set. Documented
in `docs/round-12-postmortem.md`.

## A3 — Federal holiday date computation

Brief asked: "Compute Memorial Day / Labor Day / Thanksgiving
from rules, not hard-coded dates."

Pure SQL date computation in Prisma migrations is awkward:
Postgres has the primitives but the SQL gets dense. The clean
path would be a TS migration runner, but Prisma doesn't natively
support TS in migration files.

Decision: **rules engine generates the dates; SQL embeds them**.

The `src/lib/holidays/federal.ts` + `prisma/lib/federal-holidays.ts`
files contain the rules-based computation. The SQL migration
embeds the OUTPUT for 2026/2027/2028 (33 holidays). When 2029
comes into scope, regenerate the migration via the lib. The
`/admin/holidays` "Auto-seed" kebab action handles ad-hoc current-
year backfill via the rules engine directly, no migration needed.

Documented in `docs/round-12-postmortem.md`.

## A4 — In-memory SQLite seed test

Brief suggested: "boots a fresh Prisma client against an
in-memory SQLite (or sqlite file) DB".

The schema uses Postgres-only types (`Json`, `String[]`,
`DateTime[]`, custom enums) that SQLite doesn't accept. A SQLite
fixture would either reject the schema or run against a stripped-
down version that doesn't reflect production.

Decision: **integration test gated on DATABASE_URL**, runs
against the CI Postgres service container. Local runs without a
DB skip via `describe.skipIf(!process.env.DATABASE_URL)`. Same
pattern as R11 §2D.

## A5 — `chromed-not-found` testid name

Brief asked for `data-testid="chromed-404"` in the §2J spec.
Existing code uses `chromed-not-found` (since R7 §1B). Kept the
existing name + updated the §2J spec to reference it. Renaming
the existing testid would orphan tests that already use it.

## A6 — `2fa:admin-reset` audit action name

Brief asked for `action: 'admin_reset_2fa'`. Existing code uses
`2fa:admin-reset` (since R8 §3A). Kept the existing name to
avoid orphaning historical audit rows produced before R12.

The format normalization (move every audit string to
`<entity>.<verb>` style) is filed in `docs/round-12-backlog.md`
as a future round task with a migration that rewrites historical
rows.

## A7 — Sessions panel: privacy-by-design vs forensic detail

Brief offered (a) vs (b):
- (a) Label as Session id / Device fingerprint, drop ip:/ua:
  prefixes
- (b) Store and render real IP + humanised UA

Decision: **(a) privacy-by-design**. Three reasons:

1. We already hash IP + UA at the lib layer (`src/lib/auth/sessions.ts`).
   Reverting to plaintext storage would be a privacy regression.
2. Security operators who need real IP/UA values can grab them
   from access logs at the load balancer or CDN layer. The DB
   doesn't need to be the canonical forensic store.
3. Hash truncations are still useful: same fingerprint across
   sessions = same device, suspicious if mismatched.

Documented in `docs/round-12-postmortem.md`. If the security
policy ever flips to (b), the hash fields retire + a privacy
review fires.

## A8 — §2 polish deferrals

Per "no PARTIAL bucket" — every leaf passes acceptance test or
moves to backlog with reason. The §2B / §2D / §2E / §2F / §2H
items each need substantial UX work that doesn't fit a single-
leaf scope. Filed in `docs/round-12-backlog.md` with documented
reasons. The R13 entrypoint section calls them out as the
headlining polish work.

## A9 — Persona Playwright spec depth

R11 stubbed the 7 spec files; R12 §1E wired the Playwright
runtime. The brief's §3A asks for detailed workflow assertions
per persona (driver clicks Start, tech clicks Pick up, etc.).

The R11 stubs cover the 200 / 403 walks. The detailed workflow
assertions are filed in `docs/round-12-backlog.md` as a R13
entrypoint — each persona's deep workflow is its own commit.

## A10 — Server-action redirects after a successful write

Server actions like `transitionTicketAction` redirect to
`/tickets/<cuid>` on success. That URL hits the canonicalisation
redirect (R12 §1B) and 308's to `/tickets/<INC#>`. Net result:
the user sees the canonical URL; one extra HTTP redirect happens
but is invisible to the user.

Could have updated the server actions to redirect directly to the
canonical URL, but that requires every action to look up the
incidentNumber. The 308-via-page-handler approach is cleaner —
all server actions stay simple, canonicalisation is centralized.

## A11 — Read-only API hardening surface count

Brief listed 16 endpoints. The actual mutation surface in this
codebase is mostly Server Actions (not REST API routes), so the
§3F structural test asserts on 17 surfaces — 10 server actions +
7 API routes / endpoints. The live HTTP walk continues via the
R11 §2C `e2e/readonly-role-403.spec.ts` which exercises both
classes.
