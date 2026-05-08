# Deploy runbook

How to deploy BreakFix Triage and verify the deploy succeeded.

## Production deploy steps

1. Build + push the Docker image (CI handles this automatically
   on every merge to `main` via `.github/workflows/docker-publish.yml`).
2. Pull the new image on the production host and restart the
   container.
3. The container's `CMD` runs:

   ```
   npx prisma db push --skip-generate \
     && npx tsx prisma/bootstrap.ts \
     && node node_modules/next/dist/bin/next start
   ```

   - `prisma db push` applies schema changes from `prisma/schema.prisma`.
   - `prisma/bootstrap.ts` ensures (a) initial admin user exists
     (R10 work) and (b) seedDefaults() inserts the EmailTemplate /
     EmailRule / Holiday floor (R12 §1A).
   - `next start` boots the app on `:3000`.

4. **Run the post-deploy verification** (R12 §3E):

   ```bash
   BASE_URL=https://triage.omnia-house.com \
   COOKIE='<admin session cookie>' \
   bash scripts/verify-deploy.sh
   ```

   The script asserts:
   - 5 critical routes return 200 with the expected page-marker
     string (My Day / Tickets / Admin / Scheduling / Dashboards)
   - `/admin/email-rules` does NOT show the empty-state seed CTA
     banner — proving the seed migration / bootstrap ran
   - `/admin/holidays?year=<current>` does NOT show "No holidays in
     <year>" — proving the holiday seed populated

   Exits non-zero on any failure. Wire into the deploy workflow as
   a post-deploy gate (manual today; future CI integration is a
   straightforward addition).

5. **If verify-deploy fails**: don't roll back automatically.
   Investigate the specific check that failed:
   - 5xx on a critical route → check the container logs +
     `bootstrap` output for crash signatures
   - `/admin/email-rules` shows the seed CTA → bootstrap couldn't
     reach Prisma; verify DATABASE_URL is set correctly
   - `/admin/holidays` shows empty year → run
     `npx tsx prisma/seed-defaults.ts` against the production DB
     directly as a one-shot fix; investigate why bootstrap didn't
     fire

## Why bootstrap is the seed canary

Production uses `prisma db push --skip-generate` (not
`migrate deploy`) for schema changes. So the
`prisma/migrations/<ts>_seed_defaults/migration.sql` migration
does NOT fire on production.

Instead, `prisma/bootstrap.ts main()` calls
`seedDefaults(prisma)` after the admin-user setup. Both paths
land on the same idempotent function. The migration path is the
fallback for environments using migrate deploy (CI, future
production cutover).

## CI deploy verification

`.github/workflows/ci.yml` runs three jobs that gate every PR:

- `forbidden-tokens` — runs `bash scripts/check-forbidden-tokens.sh`
- `vitest` — runs `npx vitest run`
- `typecheck` — runs `npx tsc --noEmit`
- `integration` — provisions Postgres + Mailpit + runs
  `prisma migrate deploy` + `npm run db:seed:defaults` + tests
  under `tests/integration/`. The migrate-deploy log is captured
  to `migrate-deploy.log` and grepped for "Skipped" or "rolled
  back" — either fails the build (R12 §1F).
- `playwright` — provisions Postgres + runs
  `prisma migrate deploy` + `npm run db:seed:test` + builds
  Next.js + runs `npx playwright test` against the live build.
  Chromium-only (R12 §1E).

A green CI run is the precondition for merge. The post-deploy
verification (`scripts/verify-deploy.sh`) is the post-merge
canary.

## Rollback

If verify-deploy fails AND the cause isn't the seed (i.e. a real
regression):

1. Pull the previous image tag: `docker pull <image>:<previous-sha>`
2. Restart the container with the previous image
3. Re-run `verify-deploy.sh` against the rolled-back deploy
4. File a P0 issue + link the failed deploy log

Database schema migrations are forward-only by design — never
roll back `prisma db push` or `migrate deploy`. If a migration
broke production, ship a forward-fix migration, don't rewind.

## Per-round post-deploy walks

Each round publishes a "Post-deploy verification protocol"
section in its summary doc:

- `docs/round-10-summary.md` — R10 walk
- `docs/round-11-summary.md` — R11 walk
- `docs/round-12-summary.md` — R12 walk

Run the verification walk for the latest round after every
deploy. The walks accumulate; an R12 deploy should pass R10 +
R11 + R12 walks.
