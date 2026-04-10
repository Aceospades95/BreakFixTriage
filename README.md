# BreakFix Triage

Operations platform for the NYC DOE device break-fix lifecycle. Replaces a
legacy Google Sheets + Apps Script workflow with a proper database-backed
application.

## What this is

BreakFix Triage tracks devices and tickets from ServiceNow intake through
scheduling, pickup, warehouse diagnosis, repair, quoting, delivery, and
closure. It is designed to scale across districts and to replace a brittle
spreadsheet-based operational workflow with:

- a **relational, auditable data model** (PostgreSQL + Prisma)
- a **state-machine-driven ticket lifecycle** (not "move a row between tabs")
- a **CSV/XLSX import pipeline** with validation, duplicate detection, and
  a reviewable conflict queue
- a **scheduling and dispatch model** with pluggable route optimization
- **role-based access control** and an **append-only audit log**
- a **Next.js 14** web UI for operations staff

See `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/MIGRATION_PLAN.md`, and
`docs/ASSUMPTIONS.md` for the full design.

## Status

**Phase 0 — Foundations (complete in this commit).**

- Full Prisma schema covering tickets, devices, schools, districts, jobs,
  routes, quotes, imports, duplicates, audit, and notifications
- Ticket state machine with transition guards, event log, and audit writes
- CSV/XLSX ingestion pipeline that maps ServiceNow headers, validates rows
  with Zod, upserts tickets, and detects duplicates
- Duplicate conflict resolution engine tied to the state machine
- Nearest-neighbor route optimizer behind a swappable interface
- RBAC matrix for seven roles
- Next.js skeleton pages for tickets, imports, duplicates, scheduling,
  and dashboards
- Vitest coverage for state machine, mapper/schema, optimizer, and RBAC
- Deterministic seed data (two districts, four schools, three tickets)

**Not yet wired in Phase 0 (by design — comes in Phase 1+):**

- Sign-in flow (NextAuth wiring)
- Upload UI for imports (service function `runImport` is ready)
- Interactive duplicate resolution UI (service function `resolveDuplicate`
  is ready)
- Email sending beyond the stdout transport
- ServiceNow API mode (CSV/XLSX import works today)

## Local setup

You need **Node 20+** and **Docker** (or a local PostgreSQL 15 instance).

```bash
# 1. Install
npm install

# 2. Start Postgres
docker compose up -d

# 3. Configure env
cp .env.example .env.local
# (defaults work with docker-compose)

# 4. Generate the Prisma client, run migrations, and seed
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Run tests (no DB needed)
npm run test

# 6. Start the app
npm run dev
```

Visit http://localhost:3000.

## Importing a sample CSV

`sample-data/servicenow-example.csv` contains five representative rows.
Once the seed has run, you can exercise the importer from a one-off script
(upload UI ships in Phase 1):

```ts
// scripts/import-sample.ts (create locally)
import { readFile } from "node:fs/promises";
import { runImport } from "@/lib/import/pipeline";
import { prisma } from "@/lib/db/prisma";

const buf = await readFile("sample-data/servicenow-example.csv");
const admin = await prisma.user.findUniqueOrThrow({
  where: { email: "admin@breakfix.local" },
});
console.log(
  await runImport({
    filename: "servicenow-example.csv",
    buffer: buf,
    uploadedByUserId: admin.id,
  }),
);
```

```bash
npx tsx scripts/import-sample.ts
```

## Repository layout

```
docs/                Architecture, domain, migration plan, open questions
prisma/              Schema + migrations + seed
sample-data/         Example ServiceNow export
src/
  app/               Next.js App Router pages
  lib/
    audit/           Append-only audit log helpers
    auth/            RBAC + session types
    db/              Prisma client singleton
    duplicates/      Duplicate detection + conflict resolution
    import/          CSV/XLSX parse → map → validate → upsert
    notifications/   Notification transport abstraction
    reports/         Dashboard queries
    routing/         Route optimizer abstraction (default: nearest neighbor)
    scheduling/      Jobs + routes + dispatch
    workflow/        Ticket state machine + transitions
tests/               Vitest coverage for pure business logic
```

## Testing

```bash
npm run test         # run once
npm run test:watch   # watch mode
npm run typecheck    # tsc --noEmit
```

Tests are pure unit tests over the state machine, import mapper/schema,
route optimizer, and RBAC. They do not require a database. Database-
touching integration tests arrive in Phase 1.

## Phasing (from `docs/MIGRATION_PLAN.md`)

| Phase | Scope                                                                                 |
| ----- | ------------------------------------------------------------------------------------- |
| 0     | Foundations: schema, state machine, import pipeline, duplicates, RBAC, skeleton UI   |
| 1     | Auth, ticket CRUD UI, import upload UI, duplicate resolution UI, read-only dashboards |
| 2     | Scheduling & dispatch UI, route builder, driver day view                              |
| 3     | Quotes/OOW workflow, invoice queue, hold-window automation                            |
| 4     | Google Workspace email, Google Routes optimizer, ServiceNow API connector             |
| 5     | Cutover from legacy spreadsheet after parallel-run validation                         |

## License

Internal use. Not for distribution.
