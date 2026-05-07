# Integration tests

Specs in this folder require a live Postgres at `DATABASE_URL` and
optionally a Mailpit SMTP sink at `SMTP_HOST:SMTP_PORT`. Run via:

```bash
DATABASE_URL=postgresql://bf:bf@localhost:5432/breakfix_ci \
  npm run test:integration
```

Each spec is wrapped in `describe.skipIf(!process.env.DATABASE_URL)`
so local `npm run test` (no DB) skips them gracefully.

CI provisions both services; see `.github/workflows/ci.yml`
"integration" job.

## Coverage targets (Round-11 §2D)

- `ticket-transition.test.ts` — state machine end-to-end
- `dispatch-email-event.test.ts` — chokepoint writes EmailLog
- `sla-business-hours.test.ts` — holidays excluded from elapsed
- `import-dedupe.test.ts` — re-import drops duplicates
- `audit-writers.test.ts` — every mutation writes a row
- `session-create-revoke.test.ts` — touchSession + revoke paths
