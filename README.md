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

**Phase 0 — Foundations** ✓ complete.
**Phase 1 — Auth, UI shell, read-only parity** ✓ complete.
**Phase 2 — Scheduling & dispatch** ✓ complete.
**Phase 3 — Quotes, OOW, invoices, hold-window automation** ✓ complete in this commit.

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

**Added in Phase 1:**

- NextAuth credentials provider (bcrypt against the User table) and optional
  Google Workspace OIDC
- Sign-in page, route groups `(auth)` and `(app)`, middleware-based auth
- Session helpers: `getSession()`, `requireSession()`, `requireRole()`
- Authenticated layout shell with nav and sign-out
- Ticket list with filter, search, pagination
- Ticket detail with event timeline and in-UI state transitions (via
  server actions that go through the state machine)
- Import upload UI that runs the full pipeline and shows per-row outcomes
- Duplicate resolution UI with five resolution strategies
- Dashboards wired to real queries (open by state, closed-by-month bars,
  aging table, duplicate + invoice queues)

**Added in Phase 2:**

- Scheduling dashboard grouping pickup-ready / delivery-ready / onsite-ready
  tickets by school with one-click "create job" forms
- Route builder page: multi-select unscheduled jobs, pick date + driver +
  vehicle, and the optimizer sequences the stops
- Route detail page with per-stop status controls (Start / Arrived /
  Complete / Fail), manual up/down reorder while the route is still open,
  and a Cancel Route action that reverts the underlying tickets
- `/my-day` driver view — mobile-friendly one-tap status updates over
  the signed-in user's active routes
- `updateStopStatus` service that cascades stop completions into ticket
  transitions (PICKUP_SCHEDULED → IN_WAREHOUSE, DELIVERY_SCHEDULED →
  RETURNED) and rolls the parent route forward to IN_PROGRESS / COMPLETED
- `reorderRoute` / `cancelRoute` services with audit entries
- New `stops:update` permission with DRIVER, DISPATCHER, OPS_MANAGER and
  ADMIN on the allow list; vitest coverage for the pure stop-status
  validator

**Added in Phase 3:**

- Quote lifecycle services (`createQuote`, `updateDraftQuote`,
  `sendQuote`, `respondToQuote`, `cancelQuote`) with activity logs and
  full audit trail; quote state transitions cascade into the ticket
  state machine through the existing `quoteStateAlignment` guard
- `/quotes` queue page with per-status tabs, a banner for overdue
  sent quotes, and a "Run hold-window sweep" button that triggers the
  same sweeper as the scheduled job
- Hold-window automation: `sweepExpiredQuotes` flips every overdue
  SENT quote to NO_RESPONSE and moves the owning ticket to
  QUOTE_NO_RESPONSE. Exposed both as a server action (manual trigger)
  and as a standalone `npm run quotes:sweep` script for cron
- Purchase order / invoice services: `attachPurchaseOrder` upserts a
  PO against an APPROVED quote; `markPoInvoiced` stamps `invoicedAt`
  and optionally transitions INVOICE_REQUIRED → CLOSED through the
  `invoiceBeforeClose` guard
- `/invoices` queue page listing every INVOICE_REQUIRED ticket with
  an inline PO entry form and a "Mark invoiced + close" action
- Ticket detail page now shows quote activity history and contextual
  DRAFT/SENT action buttons (Send / Approve / Decline / Cancel) plus
  an inline "Create quote" form when the ticket is in QUOTE_REQUIRED
- New vitest coverage for `isQuoteExpired` including edge cases
  (no hold window, boundary equality, non-SENT statuses)

**Not yet wired in Phase 3 (comes in Phase 4+):**

- Email sending beyond the stdout transport (currently stdout
  NotificationTransport only)
- ServiceNow API mode (CSV/XLSX import works today)
- Google Routes optimizer
- Drag-and-drop route reordering (up/down buttons ship today)
- Dry-run preview before committing an import

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

# 4. Generate the Prisma client and run migrations
npm run db:generate
npm run db:migrate

# 5. Bootstrap the initial admin user (idempotent; no-op if users already exist)
BOOTSTRAP_ADMIN_PASSWORD=changeme-long npm run db:bootstrap

# 6. (Optional) Load demo data — two districts, four schools, three sample
#    tickets. One-time only; do NOT run in production.
npm run db:seed

# 7. Run tests (no DB needed)
npm run test

# 8. Start the app
npm run dev
```

### Bootstrap vs seed

- **`db:bootstrap`** — idempotent. Creates an initial admin user if the
  database has zero users. Does nothing otherwise. This script runs
  automatically on every container start in production (via the Dockerfile
  CMD), so in Docker deployments you never need to run it by hand.
- **`db:seed`** — one-time demo data loader for local exploration. Creates
  two districts, four schools, one user per role, and three sample tickets
  in mid-lifecycle states. **Do not run this in production**: if you later
  delete the demo rows, they are not restored, but you would have
  unnecessary clutter in your real database.

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
prisma/              Schema + migrations + seed + sweep-quotes cron entry
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
    quotes/          Quote lifecycle, invoice / PO, hold-window sweep
    reports/         Dashboard queries
    routing/         Route optimizer abstraction (default: nearest neighbor)
    scheduling/      Jobs + routes + dispatch
    workflow/        Ticket state machine + transitions
tests/               Vitest coverage for pure business logic
```

## Scheduled tasks

The hold-window sweeper auto-expires any SENT quote whose `holdUntil`
timestamp has passed. Run it on whatever schedule makes sense for you:

```bash
npm run quotes:sweep   # or: npx tsx prisma/sweep-quotes.ts
```

Typical wiring is a nightly cron or Unraid User Script. The script
prints a JSON summary and exits non-zero only on unexpected errors, so
you can pipe the output straight to your notification channel of
choice. Dispatchers can also kick off the sweep manually from the
`/quotes` page via the "Run hold-window sweep" button, which calls the
same service function.

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
