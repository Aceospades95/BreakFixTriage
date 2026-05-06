# BreakFix Triage — Architecture Map (audit pass)

This is the scout's map for the migration audit (per the §1 brief). It
complements the existing `docs/ARCHITECTURE.md` (which is more
"design principles" prose) by listing concretely **what is where**, so
a reviewer can land in any subsystem without re-deriving the layout.

If something here disagrees with `ARCHITECTURE.md`, treat the code as
the source of truth; the prose may be drifting.

## 1. Stack at a glance

- **Framework:** Next.js 14 (App Router), React 18, TypeScript.
- **Server actions:** Next.js Server Actions in `src/server/actions/` (one
  module per surface area). API routes only for SSE, exports, scan
  resolve, search, attachments, and NextAuth.
- **ORM / DB:** Prisma 5 against PostgreSQL 15. Schema:
  `prisma/schema.prisma`. Migrations are `prisma migrate deploy`-style
  (not in repo — see `db:migrate:deploy` script).
- **Auth:** NextAuth (`src/lib/auth/auth.ts`) with credentials provider
  (bcrypt + optional TOTP) and optional Google Workspace SSO.
- **RBAC:** `src/lib/auth/rbac.ts` — flat permission strings, default
  role → permission map, plus per-role overrides persisted in
  `AppSetting` and lazy-loaded on first check.
- **Background jobs:** there is no in-process queue today.
  `pg-boss` is in `package.json` but **not wired**. All scheduled
  work runs as one-shot scripts under `prisma/*.ts`, executed by an
  external cron (see §3).
- **Notifications:** stdout (default) or SMTP via `nodemailer`. See
  `src/lib/notifications/`.
- **Test runner:** Vitest (`vitest.config.ts`, tests in `tests/`). 24
  test files. **No CI test job today** — the only workflow
  (`.github/workflows/docker-publish.yml`) builds and pushes the
  image but does not run tests or lint.
- **Deploy target:** Docker image (`Dockerfile`) + `docker-compose.yml`
  for local / Unraid. Production at `triage.omnia-house.com`.

## 2. Directory map

```
src/
  app/                       Next.js App Router
    (app)/                   Authenticated app routes (require session)
      page.tsx               "My Day" — unified homepage (every role)
      layout.tsx             AppShell wrapper, header, notifications bell
      loading.tsx            Skeleton shown while a server component awaits
      tickets/               Ticket list, detail, kanban
      bench/                 Tech bench (per-assignee buckets) — bug 4a
      quotes/                Quotes list with sweep button — bug 4b
      invoices/              INVOICE_REQUIRED queue
      duplicates/            Duplicate review queue
      scheduling/            Routes, jobs, calendar
      imports/               CSV / XLSX import workflow
      audit/                 AuditLog viewer
      dashboards/            Aging, devices, finance, productivity — bug 4c
      my-day/                Legacy redirect (homepage took over)
      profile/               User profile + 2FA
      scan/                  QR scanner
      admin/                 Admin: users, schools, devices, parts,
                             models, statuses, settings (bug 4d), templates,
                             districts, permissions
    (auth)/signin            Sign-in page
    portal/[token]           School-facing magic-link portal
    api/
      auth/[...nextauth]     NextAuth handler
      tickets/[id]/transition State transition endpoint (also used by kanban DnD)
      events                 SSE feed for live updates
      exports/               CSV exports for tickets/quotes/invoices/audit
      health                 Liveness probe
      attachments/[id]       Authenticated attachment download
      imports/templates      Static download of CSV templates
      scan                   Scan resolution
      search                 Cross-entity search
  components/                Shared UI components (client unless noted)
  lib/                       Domain code, framework-agnostic
    workflow/                State machine + transition.ts (the engine)
    auth/                    auth.ts, session.ts, rbac.ts, password,
                             rate-limit, totp
    db/                      Prisma client singleton
    quotes/                  lifecycle + sweep + invoice
    parts/                   inventory + movement helpers
    rma/                     manufacturer RMA helpers
    routing/                 route optimizers (nearest-neighbor +
                             google-routes connector)
    scheduling/              jobs/routes/stops services
    import/                  parse + map + pipeline + servicenow
    duplicates/              detection + resolution
    notifications/           transport + templates
    portal/                  token verify
    settings/                AppSetting key/value typed accessors
    reports/                 sla, dashboards, csv-export, productivity, digest
    cutover/                 export, integrity, compare scripts
    escalation/              "stale ticket" notifier
    events/                  in-memory SSE bus
    forms/                   form-state preserver
    audit/                   writeAudit helper
    attachments/             upload + validation
    time/                    time-tracking helper (start/stop)
    scan/                    scan code → URL resolver
    search.ts                Cross-entity search
  server/actions/            Next.js server actions (write side)
  middleware.ts              Edge auth check + READ_ONLY mode gate
  types/                     Ambient TS types

prisma/
  schema.prisma              The data model (~30 models)
  bootstrap.ts               First-run admin bootstrap (idempotent)
  seed.ts                    Demo seed (districts, users, schools,
                             devices, 3 tickets — see §6 caveat)
  sweep-quotes.ts            Hold-window sweep cron entrypoint
  sync-servicenow.ts         ServiceNow API pull cron entrypoint
  cutover-{compare,export,integrity}.ts  cutover utilities
  send-digest.ts             Daily digest cron entrypoint
  escalate-stale.ts          Escalation sweep cron entrypoint

tests/                       Vitest specs (24 files)
docs/                        ARCHITECTURE / DOMAIN / MIGRATION_PLAN /
                             CUTOVER_PLAN / ASSUMPTIONS, plus this map
sample-data/                 CSV/XLSX templates referenced by /imports/templates
unraid/                      Unraid template
.github/workflows/           docker-publish.yml only — no test job
```

## 3. Scheduled jobs (cron entrypoints)

The app does not own its scheduler. Each job is a one-shot Node script
invoked by an external cron / systemd timer / Unraid User Script:

| Script                          | Purpose                                                 | Trigger (recommended)  |
| ------------------------------- | ------------------------------------------------------- | ---------------------- |
| `prisma/sweep-quotes.ts`        | Auto-expire SENT (and post-fix: APPROVED) quotes whose `holdUntil` has passed. Writes audit + ticket transition. | Hourly                 |
| `prisma/sync-servicenow.ts`     | Pull from ServiceNow incident table → import batch → commit. | Every 15 min           |
| `prisma/escalate-stale.ts`      | Notify on tickets past `(SLA × escalationMultiplier)` days in state. | Daily 06:00            |
| `prisma/send-digest.ts`         | Email daily ops digest to recipients in `digest.recipients`. | Daily 07:00            |
| `prisma/cutover-export.ts`      | Snapshot CSV for cutover reconciliation.               | Manual (cutover only)  |
| `prisma/cutover-integrity.ts`   | Integrity report.                                       | Manual                 |
| `prisma/cutover-compare.ts`     | Diff vs. legacy sheet.                                  | Manual                 |

> Today nothing in-process schedules these. The "Run hold-window sweep"
> button on `/quotes` invokes `sweepExpiredQuotes` directly via a server
> action (`sweepQuotesAction`). That is the same code path that
> `prisma/sweep-quotes.ts` uses — see `src/server/actions/quotes.ts` and
> `prisma/sweep-quotes.ts`.

## 4. State machine (the spine)

- **Definition:** `src/lib/workflow/states.ts` exports
  `ALLOWED_TRANSITIONS: Record<TicketState, readonly TicketState[]>`.
  26 states. Tests in `tests/state-machine.test.ts` enforce that every
  non-terminal state has at least one outgoing edge and that each
  reachable from `IMPORTED`.
- **Engine:** `src/lib/workflow/transition.ts` exports `transitionTicket`.
  Every transition runs in a transaction, consults guards
  (`requireJobForScheduled`, `invoiceBeforeClose`, `quoteStateAlignment`),
  writes a `TicketEvent`, writes an `AuditLog`, and emits
  `tickets.changed` on the SSE bus after commit.
- **Force-change:** `force: true` bypasses the edge check and guards but
  still writes both rows with `forced: true` in payload. Server-side
  callers must gate this on ADMIN role themselves (the engine does not
  check the actor).
- **ON_HOLD:** uses `payload.resumeState` to remember where to go back.
  ON_HOLD's allowed-transitions list is the union of every
  non-terminal state in the catalogue, so resume can land anywhere
  reasonable.

## 5. RBAC

7 roles in the `Role` enum:

| Role          | Default surface                                                    |
| ------------- | ------------------------------------------------------------------ |
| `ADMIN`       | Everything; `force` transitions; admin pages.                      |
| `OPS_MANAGER` | All read + write + transition + scheduling/routes + quotes write.  |
| `DISPATCHER`  | Read + transition + scheduling/routes/stops. Cannot write tickets. |
| `WAREHOUSE`   | Read + transition. Used to scan-in devices.                        |
| `TECHNICIAN`  | Read + transition. Owns the bench.                                 |
| `DRIVER`     | Tickets read + scheduling read + stops update only.                |
| `READ_ONLY`  | Read-only across tickets / imports / scheduling / quotes / reports.|

Per-role overrides are stored in `AppSetting` and lazy-loaded on first
permission check (`loadPermissionOverrides`). `ADMIN` always gets every
permission regardless of overrides — that is hard-coded, by design.

## 6. Seed and fixtures

`prisma/seed.ts` is idempotent. It creates:

- 2 districts (Bronx, Queens)
- 7 users (one per role) with password `breakfix-dev`
- 4 schools, each with an address and primary contact
- 1 device model (`Acme EduBook 14`)
- 2 devices (`SN-0001`, `SN-0002`)
- 3 tickets: `INC1000001` (AWAITING_PICKUP), `INC1000002` (IN_WAREHOUSE),
  `INC1000003` (QUOTE_REQUIRED).

> **Caveat (relevant to bug 4a):** the seed never sets
> `assignedUserId` on any ticket. As a result, with a fresh seed the
> "All benches" view legitimately shows only the Unassigned bucket —
> not because the page is broken, but because there is no test data
> on the assigned side. The bug-fix branch fixes this by assigning
> `INC1000003` to Alex Admin (the test-data persona referenced in
> the task brief), so the All-benches code path actually has data
> to render.

## 7. External integrations

| Integration       | Where                                                | Direction         |
| ----------------- | ---------------------------------------------------- | ----------------- |
| **ServiceNow**    | `src/lib/import/servicenow.ts` (pull) +              | Inbound, polled.  |
|                   | `prisma/sync-servicenow.ts` (cron)                   |                   |
| **Email (SMTP)**  | `src/lib/notifications/transport.ts`                 | Outbound          |
| **Google Routes** | `src/lib/routing/google-routes.ts`                   | Outbound (pull)   |
| **Google SSO**    | NextAuth Google provider, gated by                  | Inbound (auth)    |
|                   | `GOOGLE_ALLOWED_DOMAINS`                             |                   |
| **Local FS**      | `ATTACHMENTS_DIR` for uploaded files                | Local             |

There is **no inbound ServiceNow webhook** today — ingest is poll-only
or manual file upload. Adding one is in §6 of the audit task.

## 8. Aging and SLA — where it's computed (relevant to bug 4c)

- Canonical helpers: `src/lib/reports/sla.ts` — `daysInState`,
  `slaHealth`, `slaLabel`. These use `Math.floor((now - anchor) / DAY)`
  semantics — the integer-day floor.
- Canonical helper for "open ticket aging" (post-fix):
  `src/lib/reports/sla.ts` — `daysOpen` and `isAgingOpenTicket`.
  Before the fix, the only aging logic lived in
  `src/lib/reports/dashboards.ts::agingTickets` and used a raw
  millisecond timestamp comparison, which made an exactly-30-day-old
  ticket flag as "> 30 days" (bug 4c).
- Documented convention (`docs/adr/0002-aging-convention.md`):
  `age_days = floor((now - reportedAt) / DAY); flagged ⇔ age_days > threshold`.

## 9. SSE / live updates

`src/lib/events/bus.ts` is an in-memory `EventEmitter` keyed by topic.
`src/app/api/events/route.ts` exposes an SSE endpoint that subscribes
to topics filtered by the requested set. `transitionTicket` publishes
`tickets.changed` after commit.

> Caveat: in-memory means **single-instance only**. Horizontal scaling
> would need a Redis pub/sub or a Postgres LISTEN/NOTIFY adapter. Not a
> problem at the current scale (one container) but a constraint to
> remember.

## 10. Hot spots in the code (where audit work lands)

| Concern                           | File(s)                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| State transitions / audit         | `src/lib/workflow/transition.ts`                                 |
| Bench bucketing (bug 4a)          | `src/app/(app)/bench/page.tsx`                                   |
| Quote sweep (bug 4b)              | `src/lib/quotes/sweep.ts`, `src/app/(app)/quotes/page.tsx`       |
| Aging math (bug 4c)               | `src/lib/reports/sla.ts`, `src/lib/reports/dashboards.ts`        |
| Hold-window default (bug 4d)      | `src/lib/settings/settings.ts`, `src/app/(app)/admin/settings/page.tsx`, `src/lib/quotes/lifecycle.ts` |
| Import pipeline                   | `src/lib/import/pipeline.ts`                                     |
| Duplicate detection               | `src/lib/duplicates/`                                            |
| RBAC overrides                    | `src/lib/auth/rbac.ts`                                           |
| Scheduling / routing              | `src/lib/scheduling/`, `src/lib/routing/`                        |
| Notifications                     | `src/lib/notifications/`                                         |

## 11. Unknowns / risks

Things I could not determine from reading the code alone:

- **No CI test gate.** The Docker build workflow does not run
  `vitest` / `tsc --noEmit` / `next lint`. Adding a check job is a
  prerequisite for safely shipping bug fixes from §4. Out of scope for
  this PR but should be its own follow-up.
- **No migrations directory.** The repo has `prisma/schema.prisma` but
  no `prisma/migrations/` subdir. Either migrations are git-ignored or
  the team uses `db push`. Worth asking before any schema change.
- **Live e2e is not runnable from the audit harness.** This branch was
  authored without a running Postgres / Next dev server. Bug fixes have
  unit tests; no Playwright script is committed. See
  `qa/persona-runs/SUMMARY.md` for the static-walkthrough findings and
  the explicit limitation.
- **`pg-boss` in dependencies but unused.** Dead dependency, or a
  signal that someone planned an in-process scheduler and never
  finished it. Worth flagging — this should be removed or wired up.
- **`mergedIntoTicketId` (soft merge)** is in the schema but I did not
  trace every read path to confirm it always honors the redirect. Out
  of scope for this PR but a candidate for a follow-up audit.
- **Per-school SLA overrides** are listed in the audit brief (§6) but
  do not exist today; `getSlaThresholds` is global only.
- **Duplicate "review-then-delete" gate** exists in the schema
  (`DuplicateConflict.resolution`) but I did not exhaustively verify
  every UI path forces a review step before deletion.
