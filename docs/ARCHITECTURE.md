# BreakFix Triage — Architecture

## Purpose

BreakFix Triage replaces a brittle Google Sheets + Apps Script workflow used by
a NYC DOE break-fix operation. It manages the end-to-end lifecycle of devices
and tickets ingested from ServiceNow: intake, scheduling, pickup, warehouse
intake, repair, quoting, delivery, closure, and historical reporting.

This document describes **what the system is** and **why it is built this way**.
For domain details see `DOMAIN.md`. For the rollout plan see `MIGRATION_PLAN.md`.

## Design principles

1. **Relational source of truth.** The PostgreSQL database is authoritative.
   Google Sheets, if used at all, is a downstream export, never an input of
   record.
2. **State-machine driven workflow.** Ticket lifecycle is modeled as an explicit
   state machine with allowed transitions, guards, and a persistent event log.
   No "move a row between tabs" semantics.
3. **Reviewable queues over cell highlights.** Duplicates, exceptions, and
   follow-ups surface in first-class queues with audit trails, not as colored
   cells.
4. **Normalized multi-tenant data model.** Districts, schools, contacts, and
   devices are separate entities. The Bronx is one of many districts, not the
   schema.
5. **Service-layer abstractions for external systems.** Route optimization,
   email/notifications, and ServiceNow ingestion each sit behind a stable
   interface. Default implementations are simple; production implementations
   can be swapped in without touching callers.
6. **Auditability by default.** Every state change, assignment, and import
   produces an `AuditLog` entry keyed by actor, entity, before/after, and
   timestamp.
7. **Least-privilege role-based access.** Every mutation is gated by the
   actor's role; every read view filters by what the role is allowed to see.

## High-level stack

| Layer               | Choice                                     | Rationale                                                                 |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Language            | TypeScript (strict)                        | End-to-end types from DB schema to UI                                     |
| Runtime / framework | Next.js 14 App Router (Node)               | Single deployable, server actions, streaming, file uploads built in      |
| Database            | PostgreSQL 15                              | Relational integrity, JSONB for flexible fields, mature ops tooling      |
| ORM / migrations    | Prisma                                     | Typed client, first-class migrations, readable schema                    |
| Auth                | NextAuth.js (credentials + Google OAuth)   | Works with Google Workspace SSO; roles stored in DB                      |
| Validation          | Zod                                        | Runtime validation at all boundaries (imports, forms, API)               |
| UI                  | Tailwind CSS + lightweight component set   | Minimal paid deps; consistent accessible primitives                      |
| Parsing             | papaparse (CSV), SheetJS `xlsx` (XLSX)     | Handles ServiceNow exports of either format                              |
| Background work     | `pg-boss` (Postgres-native queue)          | No separate broker; deploys with the DB                                  |
| Tests               | Vitest                                     | Fast, TS-native, good for pure business logic                            |
| Dev environment     | Docker Compose (app + postgres)            | One-command local bring-up                                               |

## Module layout

```
/
├── docs/                         # Architecture, domain, migration docs
├── prisma/
│   ├── schema.prisma             # Authoritative data model
│   ├── migrations/               # Generated migrations (one per schema change)
│   └── seed.ts                   # Deterministic seed data
├── src/
│   ├── app/                      # Next.js App Router routes (UI + API)
│   │   ├── (auth)/               # Sign-in flows
│   │   ├── (dashboard)/          # Operator-facing views
│   │   └── api/                  # JSON APIs (webhooks, imports, actions)
│   ├── lib/
│   │   ├── auth/                 # NextAuth config, RBAC helpers
│   │   ├── db/                   # Prisma client singleton
│   │   ├── workflow/             # Ticket state machine + transition guards
│   │   ├── import/               # CSV/XLSX parsing + mapping + upsert
│   │   ├── duplicates/           # Duplicate detection + conflict resolution
│   │   ├── scheduling/           # Jobs, routes, assignments
│   │   ├── routing/              # Route optimization abstraction
│   │   ├── notifications/        # Email/notification abstraction
│   │   ├── audit/                # AuditLog helpers
│   │   └── reports/              # Dashboard queries
│   ├── components/               # Reusable UI primitives
│   └── server/                   # Server-only service functions
├── tests/                        # Vitest tests
├── docker-compose.yml            # Local Postgres + app
├── package.json
├── tsconfig.json
└── README.md
```

## Request / action flow

1. User interacts with a server component or submits a server action.
2. Server action validates input with Zod.
3. Action calls into `src/server/*` which uses domain services in `src/lib/*`.
4. Domain services read/write through Prisma and emit `AuditLog` + (where
   relevant) `TicketEvent` rows.
5. Background effects (notifications, future ServiceNow sync) are enqueued on
   `pg-boss` rather than done inline.

## Ingestion flow (ServiceNow → BreakFix)

```
CSV/XLSX upload ─► ImportBatch (staging)
                    │
                    ▼
            Zod row validation ─► ImportRow.status = INVALID
                    │
                    ▼
         Mapper (column → canonical field)
                    │
                    ▼
           Duplicate engine
           ├─ exact incident match ─► DuplicateConflict (queue)
           ├─ serial reopen heuristic ─► Ticket.state = REOPENED
           └─ new                   ─► Ticket upsert
                    │
                    ▼
           TicketEvent(IMPORTED)
                    │
                    ▼
            AuditLog + ImportBatch summary
```

The importer is idempotent: re-running the same file produces zero net changes
because upsert keys are derived from immutable ServiceNow identifiers.

## Scheduling flow

A `Job` is the unit of physical work at a location (e.g., "pick up 6 devices
at PS 123"). Jobs are grouped into `Route`s via `RouteStop`s. Each `Route` is
assigned to one employee for one date. A `Route` has a `RouteOptimizer`
backend that orders its stops; the default optimizer is a greedy
nearest-neighbor over straight-line distance, and can be swapped for Google
Routes API without touching callers.

A ticket can produce multiple jobs over its lifetime (initial pickup, later
redelivery, a follow-up re-pickup). This is why `Job` is a separate entity
rather than a field on `Ticket`.

## Authentication & authorization

- **Authentication:** NextAuth.js. Default credentials provider for internal
  users; Google Workspace OIDC provider ready to enable with env vars.
- **Authorization:** DB-backed roles (`ADMIN`, `OPS_MANAGER`, `DISPATCHER`,
  `WAREHOUSE`, `TECHNICIAN`, `DRIVER`, `READ_ONLY`). Every server action and
  API route checks `requireRole(...)`. District scoping is enforced by
  `User.districtIds` → queries are filtered by allowed district IDs.

## Notifications

Email-triggering events (device scheduled, quote sent, out-of-scope closure,
no-response follow-up) are recorded as `Notification` rows with a pluggable
`Transport`. The default transport logs to stdout; SMTP, Gmail API, and an
Apps Script webhook transport can be added later without touching business
logic.

## What we are deliberately **not** doing

- Not building a Sheets clone. Tabs, colors, and spreadsheet formulas are
  reference material, not a spec.
- Not coupling to Google Sheets as a storage or sync backbone.
- Not hardcoding quote / OOW business rules — configurable where possible.
- Not building speculative abstractions. The optimizer, notifier, and
  ServiceNow connector are interfaces because they have at least two concrete
  implementations in the roadmap; other modules stay concrete.
