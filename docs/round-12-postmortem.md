# Round-12 postmortem — auto-seed deploy gap

## Severity

P1. Production functioning but operating in a degraded state:

- `/admin/email-rules` showed "0 rules · admin" with the
  empty-state seed banner — meaning no notifications were
  actually firing on any ticket lifecycle event.
- `/admin/email-templates` showed "0 templates available" — so
  even if a rule existed, dispatchEmailEvent had nothing to
  render.
- `/admin/holidays` showed "0 entries for 2026" — SLA
  business-hours math was billing weekends and federal holidays
  as work time.

For weeks, post-Round-11 deploy.

## Timeline

| When | Event |
|------|-------|
| Round-10 §2H | `seedDefaults()` first appeared — invoked from `prisma/seed.ts` only. Production never ran `npm run db:seed` so the function never fired. |
| Round-11 §1E | `seedDefaults()` extracted to `prisma/seed-defaults.ts` + `npm run db:seed:defaults` script + `docs/round-11-seed-audit.md` documented the production backfill path. The doc said: "After deploy, run npm run db:seed:defaults once." |
| Round-11 deploy | The operator never ran the script. EmailTemplate / EmailRule / Holiday tables stayed empty. |
| Round-12 recon | `/admin/email-rules` shows "0 rules · admin" with the seed banner. `/admin/holidays` shows "0 entries for 2026". |
| Round-12 §1A | Fixes the deploy gap: bootstrap.ts now calls seedDefaults() on every container start, AND a Prisma migration ships the same row set, AND the audit row writer tags each seed insert with `action='system_seed'`. |

## Root cause

The R11 path required a manual operator action (`npm run db:seed:defaults`)
that wasn't part of any deploy automation. The seed script existed,
the documentation existed, the npm script existed — but the
container start sequence in `Dockerfile`'s `CMD` was:

```
npx prisma db push --skip-generate \
  && npx tsx prisma/bootstrap.ts \
  && node node_modules/next/dist/bin/next start
```

`prisma/bootstrap.ts` only created the initial admin user. It
did NOT call `seedDefaults()`. The CMD also used `db push` not
`migrate deploy`, so any migration-time seed wouldn't have
fired either.

The R10 attempt to seed via `prisma/seed.ts` failed because
production never runs `npm run db:seed` — that script is for dev
fixture creation, not production bootstrap.

## What gate would have caught this?

None. `tsc`, vitest, the forbidden-tokens grep gate, the route
smoke spec — none of them inspect runtime database row counts
post-deploy. The R11 documentation existed but documentation is
a request, not a guarantee.

R12 adds three gates that close the loop:

1. **Bootstrap call** — `prisma/bootstrap.ts main()` now calls
   `seedDefaults(prisma)` after the admin-user setup. Bootstrap
   already runs on every container start. Idempotent so
   re-running is safe.

2. **Prisma migration** — `prisma/migrations/20260507000001_seed_defaults/migration.sql`
   inserts the same row set as a SQL migration. Any environment
   running `prisma migrate deploy` (CI, future production
   migration to migrate-deploy) gets the seed for free.

3. **Deploy verification script** — `scripts/verify-deploy.sh`
   curls `/admin/email-rules` and `/admin/holidays` post-deploy
   and asserts the empty-state banner is NOT present. Wires into
   the deploy workflow as a post-deploy CI gate (§3E).

## Lessons

- "Document the manual step" is a paper-trail solution, not a
  reliability solution. Wire the step into the automation or
  expect operators to forget.
- Bootstrap and migration are the two production deploy hooks
  that *will* fire. Anything else is opt-in and lossy.
- A post-deploy verification script that asserts on user-visible
  state catches the class of bug — a deploy "succeeded" but the
  product is broken.
- The fix is idempotent in three places. If any one path fires,
  the seed is in place.

## Lockstep file

`src/lib/holidays/federal.ts` and `prisma/lib/federal-holidays.ts`
are byte-for-byte identical (sans the docblock). The vitest gate
asserts this so a refactor of one without the other fails CI. The
duplication is intentional: the prisma/ copy stays self-contained
for the Docker runner image (which only copies `prisma/`, not
`src/`); the src/ copy is used by the `/admin/holidays` "Auto-seed"
kebab action which runs in the Next.js runtime.
