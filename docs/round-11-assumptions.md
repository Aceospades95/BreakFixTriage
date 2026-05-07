# Round-11 assumptions

Things the R11 brief did not explicitly specify, where Claude
Code made a judgment call. Each entry includes the assumption
and the alternative we'd take if the assumption proves wrong.

## A1 — Branch name

The brief asked for `round-11/hotfix-tickets-and-graduations`.
The harness instructions require all development on
`claude/breakfix-triage-audit-ZDYuJ`. We treated the brief's
branch name as an informational chapter label and continued on
the harness branch. This matches R10's pattern.

**Alternative**: branch off and rebase. We didn't because the
harness explicitly forbids pushing to a different branch.

## A2 — Audit action name format

R11 brief said `action=staffschedule.create`. The existing code
writes `staff.schedule.created`. Both formats convey the same
semantics. We kept the existing format to avoid orphaning audit
rows produced before the deploy.

**Alternative**: rename + ship a migration that rewrites
historical rows. Filed in backlog as future work.

## A3 — Placeholder convention edge cases

26 placeholders moved to `e.g. <example>`. Some sit in a gray
zone:

- `123456 or recovery code` — left as-is (instruction with format
  hint, not a pure example).
- `Search nav, INC2200126, school code, SN-…` — left as-is (the
  inline examples already serve as the e.g.).
- `Line 1`, `City`, `ZIP`, `Email`, `Phone`, `Title` — left
  plain (single-word field labels that double as instruction).

Decision rule documented in `docs/round-11-placeholder-audit.md`.

**Alternative**: prefix every placeholder uniformly. We avoided
because some prefixes would read weirder than the original (e.g.
`e.g. City` for a city name field reads as if the user should
type "City").

## A4 — UserSession field rename

R11 brief specified `ipHash`, `uaFingerprint`, `expiresAt` as
required fields. R10 had `ip` (raw String?), `userAgent` (raw
String?). We treated this as a rename + privacy upgrade.

In production the table is empty (R10 §1F never wrote rows
because middleware was missing), so the rename is safe. No
backfill needed.

**Alternative**: keep the old fields and add the new ones. We
didn't because the brief explicitly asked for the new names AND
the privacy improvement (hashing IP/UA) is the right move
regardless.

## A5 — `AUTH_SESSION_SALT` default value

`src/lib/auth/sessions.ts` defaults to a hardcoded fallback
`"breakfix-default-session-salt"` when the env var isn't set. In
production the env var is required (otherwise IP/UA hashes are
predictable) but a warning isn't logged today.

**Alternative**: throw at startup if the env var is missing in
production. Filed in backlog as future hardening.

## A6 — CSV import deferral

The brief listed import actions on schools / devices / device-
models / parts kebabs. Each requires a full importer pipeline
(form + papaparse + dedupe + audit per row) — too large to ship
in R11 alongside the rest of §1D. The kebabs DO NOT include the
import items.

**Alternative**: ship a placeholder route that says "Import
coming in R12". We avoided per the no-PARTIAL discipline.

## A7 — Persona test credentials

The 7 persona specs assume seeded users at the documented
emails (`alex@example.test`, `olivia@example.test`, etc.) with
password `test-password`. The current `prisma/seed.ts` creates
users with different emails and a generated password.

The persona specs don't run yet (gated on §2D Playwright
runtime); the seed needs to be updated to match the persona
fixture before §2E can actually execute. Documented in
`docs/personas.md` and `docs/round-11-backlog.md`.

**Alternative**: parameterize the spec with the seed's actual
credentials. We chose the documented form because it'll be
clearer when the seed updates.

## A8 — Sitemap hand-maintenance

`docs/sitemap.md` is hand-maintained. The R11 §HOTFIX-2 vitest
test enforces every `page.tsx` is referenced. The reverse —
sitemap entries that don't have a matching page.tsx — is NOT
enforced (would catch removed routes that the docs missed).

**Alternative**: bidirectional check. Skipped because removed
routes show up in PR review easily and the false-positive cost
outweighs the gate.

## A9 — Read-only role 403 path

The §2C spec asserts a blocked URL hits one of:
- HTTP 403
- redirect to /forbidden
- redirect to /signin
- redirect to /?error=

The /forbidden route doesn't exist today; the app redirects to
the home page with an error param. The spec accepts both forms
so the test is robust to either approach.

## A10 — Email log export default range

The /admin/email-log kebab "Export last 30 days CSV" defaults to
the last 30 days. Custom ranges work via `?from=&to=`. The 30
days hardcode is the kebab default; the page-level export form
(future R12) would offer a date picker.

## A11 — Round-11 §2D test:integration script

The new `npm run test:integration` script runs vitest with
`--dir tests/integration`. It requires DATABASE_URL; vitest skips
the suite without it via `describe.skipIf(!process.env.DATABASE_URL)`.

The CI integration job sets DATABASE_URL to the Postgres service
container's URL. Local runs skip the suite by default.

**Alternative**: a separate vitest config file with different
`include` glob. Same effect; the `--dir` flag is simpler.
