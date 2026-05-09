# Round-11 §1E — seed audit

## What gets seeded on a fresh install

After `prisma migrate deploy` the database is empty. Two npm
scripts populate the rows the app needs:

### `npm run db:seed:defaults` — production backfill

Idempotent. Run on every deploy. Seeds three categories — the
floor for a usable BreakFix Triage instance.

| Category | Source | Idempotency strategy | Min rows |
|----------|--------|----------------------|----------|
| EmailTemplate | `prisma/seed-email-templates.ts` | `upsert` keyed on `key` | 8 |
| EmailRule | `prisma/seed-defaults.ts` | `findFirst` then `create` keyed on `(scope=GLOBAL, event=ticket_created, templateId)` | 1 |
| Holiday | `prisma/seed-defaults.ts` + `src/lib/holidays/federal.ts` | `findFirst` then `create` keyed on `(date, scope=GLOBAL, scopeId=null)` | 11 |

Re-running produces zero new rows for any category.

### `npm run db:seed` — full development seed

Runs everything `db:seed:defaults` does PLUS the dev fixtures
(districts, schools, users, devices, sample tickets) needed to
exercise the UI locally. Idempotent via `upsert` on stable keys.

## Why each row is required

- **EmailTemplate** — `dispatchEmailEvent` rejects a send if no
  template matches the event. Without templates the app cannot
  notify SPOCs, technicians, or warehouse on any state change.
- **EmailRule** (one disabled Global) — the empty-state on
  `/admin/email-rules` had a "Seed example rule" CTA before R11;
  shipping the disabled row by default skips that step. Disabled
  by default so admins opt-in to recipients deliberately.
- **Holiday** (eleven federal) — SLA business-hours math (ADR
  0008) excludes holidays from the elapsed-time calc. Without
  rows, every weekend-and-holiday window gets billed against the
  technician's response time.

## Idempotency rules

The seed must produce the same row counts on second run. Concrete
contracts:

- `EmailTemplate.upsert` on `key` — second run updates content but
  doesn't insert
- `EmailRule.findFirst` then `create` — second run finds the
  existing row and short-circuits
- `Holiday.findFirst` on `(date, GLOBAL, null)` — second run finds
  the row and skips

Round-11 §1E test `tests/round-11/seed-defaults.test.ts` pins the
findFirst/upsert pattern against drift.

## Why R10 §2H didn't ship in production

`prisma/seed-email-templates.ts` had `main()` at the module top
followed by `.catch(() => process.exit(1)).finally(prisma.$disconnect)`.
The R10 dynamic import of that module triggered `main()` as a
side-effect AND triggered the `$disconnect()` immediately,
sometimes before the upsert loop finished. The optional-chained
default-export check `(mod as { default?: ... }).default` then
returned undefined (no default export), so the explicit await
never fired. Net: in production the function appeared to succeed
but the table stayed empty.

R11 fixes:

1. Extract `seedEmailTemplates(client)` as a proper export. The
   PrismaClient is passed in so seed-defaults.ts and seed.ts share
   the same connection.
2. Guard the direct-run with `require.main === module` so import
   doesn't fire `main()`.
3. Move the EmailRule + Holiday seed code from inline-in-seed.ts
   to a shared `prisma/seed-defaults.ts`. seed.ts now calls
   `seedDefaults(prisma)` and the production backfill calls the
   same module.

## Production deploy hook

After `prisma migrate deploy` the deploy pipeline must run
`npm run db:seed:defaults` exactly once per deploy. The script is
idempotent so there's no harm in running it on every deploy,
which is what we recommend.

A future round can promote the script to a true Prisma migration
once Prisma supports TS migration steps, or wire it via a custom
post-deploy command in the host platform (Vercel cron, Docker
ENTRYPOINT, etc.).

## Backfill for existing production instances

Same script — `npm run db:seed:defaults`. Idempotent. Run once on
the existing instance to populate the missing
EmailTemplate / EmailRule / Holiday rows that R10 §2H failed to
seed. Verify by checking row counts:

```sql
SELECT 'EmailTemplate', count(*) FROM "EmailTemplate"
UNION ALL SELECT 'EmailRule', count(*) FROM "EmailRule"
UNION ALL SELECT 'Holiday', count(*) FROM "Holiday" WHERE scope='GLOBAL';
```

Expected after backfill: ≥8, ≥1, ≥11.
