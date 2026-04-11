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
**Phase 3 — Quotes, OOW, invoices, hold-window automation** ✓ complete.
**Phase 4 — Email, Google Routes, ServiceNow API** ✓ complete.
**Phase 5 — Cutover tooling and runbook** ✓ complete in this commit.

All five phases from `docs/MIGRATION_PLAN.md` are now shipped. What
ops does next is an operational exercise; see `docs/CUTOVER_PLAN.md`
for the step-by-step runbook.

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

**Added in Phase 4:**

- SMTP notification transport built on nodemailer, compatible with
  Google Workspace SMTP relay, Gmail app passwords, SES, SendGrid, or
  any other RFC-compliant server. Selected by `NOTIFICATION_TRANSPORT=
  smtp` (or auto-detected whenever the `SMTP_*` env vars are
  populated), with graceful fallback to the stdout transport.
- Pure-function notification templates for quote-sent, delivery-
  scheduled, pickup-scheduled, and quote-no-response, all plain text
  so they work across stdout, SMTP, and any future webhook transport.
- `enqueueNotification` helper that writes a PENDING Notification row
  and (outside a transaction) fires the dispatch in the background,
  recording success or failure back onto the row.
- Live notifications wired into `sendQuote`, `buildRoute`, and
  `sweepExpiredQuotes`, each routed to the school's primary contact.
- Google Routes optimizer with `buildComputeRoutesBody` and
  `parseComputeRoutesResponse` exposed as pure functions for unit
  testing; selected by `ROUTE_OPTIMIZER=google-routes` with a
  populated `GOOGLE_ROUTES_API_KEY`. Fails open to the built-in
  nearest-neighbor optimizer if the key is missing.
- ServiceNow API connector: `normalizeServiceNowRow` (pure mapper),
  `fetchServiceNowIncidents` (Table API wrapper with basic auth), and
  `runServiceNowSync` (runs the records through the existing commit
  pipeline and writes a real `ImportBatch`).
- Manual "Sync from ServiceNow" button on `/imports/new` gated on
  `SERVICENOW_*` env vars, plus a standalone
  `npm run servicenow:sync` script for cron / Unraid User Scripts.
- New vitest coverage: notification templates (8 cases), Google
  Routes response parser + body builder (7 cases), ServiceNow row
  normalizer (6 cases).

**Added in Phase 5:**

- `src/lib/cutover/` module:
  - `compareLegacyToDb` — pure parallel-run comparison joining a
    legacy spreadsheet against the BreakFix Triage database on
    incident number. Reports rows only in the sheet, only in the
    DB, and drift on state / schoolCode / serialNumber.
  - `runIntegrityScan` / `buildIntegrityReport` — finds CLOSED
    tickets missing `closedAt`, non-terminal tickets with
    `closedAt`, `INVOICE_REQUIRED` flag mismatches, schools without
    addresses or coordinates, devices without serials, orphan
    quotes and jobs, users without a role.
  - `formatTicketsCsv` / `exportAllTicketsCsv` — RFC 4180-compliant
    CSV dump of the full ticket table for manual reconciliation.
- Standalone scripts wired to npm: `cutover:compare`,
  `cutover:integrity`, `cutover:export`. Each prints JSON to stdout
  and exits non-zero when anything looks wrong, so they drop
  straight into cron or Unraid User Scripts.
- `READ_ONLY_MODE=true` env flag that rejects every non-GET request
  at the middleware layer with a 503. The authenticated layout
  shows a prominent amber banner while the flag is active, giving
  staff a clear read-only experience during the cutover window
  without touching individual server actions.
- `docs/CUTOVER_PLAN.md` — end-to-end cutover runbook with an
  eight-step checklist covering freeze, final import, integrity
  scan, parallel run, cutover day, post-cutover monitoring, and
  rollback.
- New vitest coverage: comparison (7 cases), integrity report
  builder (6 cases), CSV export + escaper (12 cases).

**Deferred future work:**

- Drag-and-drop route reordering (up/down buttons ship today)
- Dry-run preview before committing an import
- HTML email templates (plain text only today)

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
docs/                Architecture, domain, migration plan, cutover runbook
prisma/              Schema + seed + cron/cutover entry points
sample-data/         Example ServiceNow export
src/
  app/               Next.js App Router pages
  lib/
    audit/           Append-only audit log helpers
    auth/            RBAC + session types
    cutover/         Parallel-run compare, integrity scan, CSV export
    db/              Prisma client singleton
    duplicates/      Duplicate detection + conflict resolution
    import/          CSV/XLSX parse → map → validate → upsert, ServiceNow API
    notifications/   Transports (stdout, SMTP), templates, enqueue helper
    quotes/          Quote lifecycle, invoice / PO, hold-window sweep
    reports/         Dashboard queries
    routing/         Route optimizer abstraction (default + Google Routes)
    scheduling/      Jobs + routes + dispatch
    workflow/        Ticket state machine + transitions
tests/               Vitest coverage for pure business logic
```

## Scheduled tasks

Several scripts ship today. Each can run on a cron, an Unraid User
Script, or whatever scheduler your environment uses:

```bash
npm run quotes:sweep       # auto-expire quotes past their hold window
npm run servicenow:sync    # pull fresh incidents from ServiceNow
npm run cutover:compare    # parallel-run comparison against a legacy sheet
npm run cutover:integrity  # scan for data quality issues
npm run cutover:export     # dump all tickets as CSV
```

Each script prints a JSON summary and exits non-zero on unexpected
errors, so you can pipe the output straight into your alerting
channel of choice. Both are also exposed in the UI:

- `/quotes` → "Run hold-window sweep" button (same code path as
  `npm run quotes:sweep`).
- `/imports/new` → "Sync from ServiceNow" button, gated on the
  `SERVICENOW_*` env vars being populated.

The ServiceNow sync writes a real `ImportBatch`, so both cron runs
and manual syncs show up in `/imports` alongside CSV uploads.

## Email

By default notifications log to the container's stdout. To send real
email, set `NOTIFICATION_TRANSPORT=smtp` (or just populate the
`SMTP_*` vars in `.env.example`) and provide credentials to a relay
your Workspace / SMTP provider accepts. The transport is built on
nodemailer, so anything nodemailer talks to works:

```
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<workspace service account>
SMTP_PASS=<app password>
SMTP_FROM="BreakFix Triage <ops@your-domain.org>"
```

The app fires live emails whenever a quote is sent, a route with a
delivery or pickup is built, or a quote auto-expires via the
hold-window sweeper. Recipients come from each school's primary
`Contact.email`; schools without a contact silently skip the
notification rather than failing the upstream operation.

## Cutover

Phase 5 ships the tooling and playbook for moving off the legacy
spreadsheet. See `docs/CUTOVER_PLAN.md` for the full step-by-step
runbook. The short version:

1. **Freeze the spreadsheet** — revoke edit access, export a snapshot.
2. **Final import** — upload the snapshot through `/imports/new` or
   let `npm run servicenow:sync` pull the same data from the API.
3. **Integrity scan** — `npm run cutover:integrity`. Must exit clean.
4. **Parallel run** — `npm run cutover:compare -- snapshot.csv` daily
   for one week. Exit criterion: three consecutive clean runs.
5. **Cutover day** — set `READ_ONLY_MODE=true`, take the final
   `npm run cutover:export`, unset the flag, archive the sheet.
6. **Monitor** — keep running `cutover:integrity` and `quotes:sweep`
   for two weeks.

`READ_ONLY_MODE=true` is the kill switch: every non-GET request
returns 503 at the edge, and a banner appears on every page while
the flag is active. Flip it off and redeploy to resume writes.

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
