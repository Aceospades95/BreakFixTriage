# ADR 0007 — Email rules + templates engine

**Status:** Accepted (Stage 1 — orchestration layer + schema +
templates seed shipped). **Stage 2 (admin UI, full trigger
wire-up, Resend SDK) is gated** — tracked in §19 of the Round-2
brief and `docs/proposed-issues.md`.

**Date:** 2026-05-06.

## Context

The Round-2 QA brief commissions an email/notification rules
domain to replace the existing ad-hoc `Notification` writes
(single-recipient, no html, no template trail) with a rules
engine: an `EmailRule` names recipients, links a template, and
fires on a domain event. `EmailLog` records every send with
full headers + status. The blast radius spans Schools (SPOC
contact prefs), Tickets (ticket_created / assigned / status
changed), Scheduling (delivery_scheduled / completed),
Quotes (quote_sent / approved_internal), SLA (breach
warnings/breached), Digest, and Audit.

The legacy `Notification` model stays in place for the
lifecycle code paths that still write through it (the quote
sweep, the school-portal send paths). Migrating those paths
is a follow-up; until then both models coexist.

## Decision

### Recipient model

Each `EmailRule.recipients` is a JSON blob shaped:

```ts
{ to: Recipient[]; cc: Recipient[]; bcc: Recipient[] }
```

A `Recipient` is a tagged union:

| `kind`              | What it expands to                                            |
| ------------------- | ------------------------------------------------------------- |
| `spoc`              | School contacts where the matching `receives*` flag is true. |
| `ticket_reporter`   | `ticket.meta.requesterEmail` (set by the import pipeline).   |
| `wynndalco_team`    | `Settings.wynndalcoTeamEmails` array.                         |
| `literal`           | `value` verbatim.                                             |

`spoc` is gated by event family:
- `ticket` family (`ticket_created`, `ticket_assigned`,
  `ticket_status_changed`) reads `Contact.receivesTicketEmails`.
- `quote` family reads `receivesQuoteEmails`.
- `delivery` family reads `receivesDeliveryReceipts`.
- `internal` family (`quote_approved_internal`, `sla_*`,
  `daily_digest`) never reads SPOC at all — those rules
  default to `wynndalco_team`.

Resolved addresses are deduped + lowercased. `to` empty after
resolution → the send is skipped and a `failed` EmailLog row is
written with `error = "no \`to\` recipients resolved"` so ops
can see why nothing went out.

### Queue choice

DB-backed via `EmailJob`. Three reasons:

1. The deploy target (Unraid container; future Vercel hosting
   uncertain) cannot reliably host Redis.
2. Email volume is small (a few hundred/day in steady state);
   pg-boss / BullMQ are overkill.
3. Postgres row-locking via `update where lockedAt IS NULL` is
   sufficient for "exactly one worker wins" semantics at this
   scale.

Worker (`scripts/email-worker.ts` / `npm run email:worker`)
polls every 2s, claims one job, dispatches via the configured
provider, updates the matching EmailLog, repeats. Stale-lock
recovery: a job whose `lockedAt` is older than 10 minutes is
re-claimable. This makes the system resilient to worker crashes
without needing a heartbeat protocol.

### Provider abstraction

Three implementations behind `EmailProvider`:

- `stdout` — default; logs to console. Used in dev / CI.
- `smtp` — reuses the existing nodemailer-backed
  `NotificationTransport` from `src/lib/notifications/`. The
  SMTP envelope is sent one recipient at a time today (the
  legacy transport's `recipientEmail` is single-valued); a
  follow-up wires real to/cc/bcc fan-out at the provider level.
- `resend` — placeholder. The brief names Resend as preferred
  but the SDK wire-up needs `RESEND_API_KEY` plus a wired send
  call. Falls back to stdout with a console warning until the
  real wiring lands.

Provider creds live ONLY in env (`RESEND_API_KEY`, `SMTP_*`).
Settings carries only the selection + addresses.

### Retry policy

`fail()` with exponential backoff curve:

| attempt | backoff |
| ------- | ------- |
| 1       | 1 minute  |
| 2       | 5 minutes |
| 3       | 30 minutes |
| 4       | 2 hours   |
| 5+      | dead-letter (status=failed, lastError set) |

Failed jobs stay around so ops can inspect on
`/admin/email-log` (when that page lands) and "retry" via a
button that resets `attempts = 0` and `nextRunAt = now()`.

### Idempotency

If a worker crashes after the provider acknowledged but before
`complete()` ran, the lock release (10-minute stale-lock window)
lets a peer re-claim the job. `processEmailJob` checks
`EmailLog.providerMessageId` — if already set, the run is a
no-op success. Real duplicate sends avoided.

### Audit + observability

Every `dispatchEmailEvent` call writes an audit row with:

```
action = "email:dispatch:queued:<event>"
          OR "email:dispatch:skipped:<event>"
          OR "email:dispatch:sent:<event>" (worker run)
          OR "email:dispatch:failed:<event>" (dead-letter)
transitionType = "email_send"  (extended TransitionType union; see ADR 0006)
reason = template key / skip reason
after = { to, cc, bcc, template }
```

The audit-log viewer at `/admin/audit` renders these via the
new chip formatter (ADR 0006 + Round-2 §13).

## Defers (Stage 2)

These are tracked in `docs/proposed-issues.md` and §19 of the
Round-2 final QA checklist:

1. **`/admin/email-rules`, `/admin/email-templates`,
   `/admin/email-log`** — admin pages. The data model is
   complete; the UI is its own workstream.
2. **Trigger wire-up.** `dispatchEmailEvent` exists; the calls
   from `ticket-create / ticket-assign / transition guard /
   stop-status / quote-send` server actions need the
   maintainer's call on default rules (which to seed fresh
   DBs with). Until rules exist, dispatch is a no-op.
3. **Resend SDK** wiring + dashboard contracts.
4. **Provider-side bcc fan-out** (currently the SMTP path
   sends one envelope per address).
5. **Per-locale variants** (preferredLanguage column on
   SchoolContact is in place; render doesn't honour it).
6. **`invoice_sent` event** (the brief flagged this as a gap;
   the user listed invoices in the email blast radius but the
   item enumeration didn't include the matching event).

## Consequences

- A migration is required (`prisma db push` or a generated
  migration; the runner image runs `db push --skip-generate`
  on container start, so the schema additions land
  automatically when the container restarts after this branch
  merges).
- The legacy `Notification` model continues to receive writes
  from existing code paths. Migrating those is a separate
  effort; the legacy table is preserved for backwards
  compatibility.
- A new long-running worker process is required in production.
  If the deploy target cannot host one, the cron-poll wrapper
  (`* * * * * timeout 30 npm run email:worker`) is a
  documented fallback.

## Alternatives considered

- **pg-boss.** The dependency is already in `package.json`
  (Round-1 found it unused). Pulling in pg-boss would be
  reasonable for higher volume but adds a schema + a
  scheduling layer the email feature doesn't need. Marked
  as "remove or wire" in `docs/proposed-issues.md`.
- **Inline send (no queue).** Rejected — every send would
  block the request that triggered it, and provider hiccups
  would surface as user-facing errors on routine actions
  (creating a ticket, completing a delivery).
- **External rules engine** (drools-style). Rejected — the
  rule shape is small enough that a JSON column + a thin
  resolver is correct for the size.
