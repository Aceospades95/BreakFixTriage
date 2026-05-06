# Proposed issues — needing maintainer sign-off before implementation

The audit brief (§5, §6, §10) explicitly requires that we **not**
unilaterally introduce schema changes, new substates, permission
widening, or new product features. This file is the queue of things
that need a maintainer's "yes" before being built. When the audit PR
is reviewed, file each of these as its own GitHub issue and link the
PR back to it.

Each entry has: title, summary, suggested approach, blast radius,
recommended decision.

---

## Schema / state machine

### Q1 — `QUOTE_EXPIRED` state vs. funnel through `QUOTE_NO_RESPONSE`

- **Today (post-fix):** APPROVED quotes with `holdUntil < now()` are
  swept to `QuoteStatus.NO_RESPONSE`, the ticket goes
  `TicketState.QUOTE_NO_RESPONSE`. This piggy-backs on the existing
  enum and avoids a migration.
- **Alternative:** introduce `QuoteStatus.EXPIRED` and
  `TicketState.QUOTE_EXPIRED`, with allowed transitions
  `QUOTE_EXPIRED → PENDING_DELIVERY | OUT_OF_SCOPE`.
- **Trade-off:** new states are a schema migration *and* state-machine
  change *and* require a UI tab. Funneling through NO_RESPONSE keeps
  the legacy tab list intact and is the simplest correct behavior.
- **Recommendation:** stay with NO_RESPONSE for now. Re-open if ops
  consistently can't tell "no response from school" apart from "school
  approved but PO never followed".

### Q2 — Warranty extension representation

- **Legacy:** "WARRANTY EXTENSION" sheet tab.
- **Options:** (a) two new ticket states; (b) a `warrantyExtended:
  Boolean` flag on `Device` plus a derived view at
  `/admin/devices?warrantyExtended=true`.
- **Recommendation:** option (b). Warranty extension is a property of
  the device, not a step in the repair lifecycle.

### Q3 — Printers / Reconnects queue

- **Legacy:** dedicated "PRINTERS" and "RECONNECTS" sheet tabs.
- **Options:** (a) add device-class filter chips on `/tickets` driven
  by `Device.model.formFactor`; (b) add a `Ticket.tags: String[]` for
  things like "reconnect-only" that aren't a device class.
- **Recommendation:** ship (a) first (zero schema cost — `formFactor`
  already exists). Ship (b) as a follow-up if ops needs more than the
  device class.

---

## Permissions

### Q4 — DISPATCHER: add `DUPLICATES_RESOLVE`

- The `DISPATCHER` role today has no `DUPLICATES_RESOLVE` permission,
  but the legacy spreadsheet workflow had dispatch resolving dupes.
- **Recommendation:** add `DUPLICATES_RESOLVE` to the DISPATCHER
  default. Permission widening, so requires explicit sign-off.

---

## Product features (§6 of the audit task)

### Q5 — Bulk reassign with required reason

- Today `bulkAssignAction` accepts an optional reason in the audit
  payload.
- Add a required `reason` field to the bulk-action form, plumb it into
  the `AuditLog.after.reason` and into a `TicketEvent` per affected
  ticket (currently the bulk reassign writes a single audit row, not
  per-ticket events).

### Q6 — Kanban DnD persistence audit + reason

- The Kanban view's DnD already posts to
  `/api/tickets/[id]/transition`. Verify (with a Playwright test) that
  every drop writes a TicketEvent. Add a "reason on drop" prompt that
  feeds `transitionTicket(opts.reason)`.

### Q7 — Import dry-run preview

- Today `runImport` validates and stages rows; `commitRow` performs
  the writes. We have the data shape to build a dry-run preview UI,
  but the page just shows totals, not row-by-row will-create /
  will-update / will-skip / will-error. Build that, applied to all
  six import types (TICKETS, SCHOOLS, DEVICES, USERS, PARTS,
  DEVICE_MODELS).

### Q8 — ServiceNow webhook ingest

- Replace polling with an authenticated webhook keyed on `sys_id`,
  with a replay tool. Today's pull cron stays as fallback / replay.

### Q9 — Per-school SLA overrides

- `getSlaThresholds` today returns globals. Add per-school overrides
  (resolution order school → state default → global default) on
  `/admin/schools/[id]`.

### Q10 — Role-scoped landing pages

- DRIVER → today's route, WAREHOUSE → bench, TECHNICIAN → queue,
  OPS_MANAGER / DISPATCHER / ADMIN → My Day, READ_ONLY → dashboards.
- The current `/` already adapts, but add a per-user override.

---

## Tooling / infra

### Q11 — CI test gate

- `.github/workflows/docker-publish.yml` builds and pushes the image
  but does not run `npm run test` or `tsc --noEmit`. Add a small
  `test.yml` workflow that runs `npm ci`, `npm run typecheck`,
  `npm test`, and `npm run lint`, gated on PRs. This is a
  prerequisite for §9's "each PR must be green in CI before requesting
  review".

### Q12 — Playwright e2e harness

- Skeleton at `qa/playwright/personas.spec.ts.skeleton`. Wiring it up
  needs `@playwright/test` as a dev dependency, a Postgres-backed
  test stack in CI, and a seed step. Estimate: 1 PR for setup, 1 PR
  per persona scenario.

### Q13 — In-process scheduler

- Today every recurring job is an external cron entrypoint. `pg-boss`
  is in `package.json` but unused. Either wire it up (one cron-style
  registration in a server bootstrap) or remove the dependency.

### Q14 — Auto-merging duplicate review

- The duplicate-review UI exists, but a full audit confirming **every
  deletion path** requires `resolution` to be set first is deferred.
  Spot check passed; full audit needed.

### Q15 — District scoping audit

- `DistrictUser` exists and is referenced in the schema; need to
  exhaustively confirm every read path scopes by the session user's
  districts. **Treat as a S1 candidate** — until verified, an admin
  who is intended to be Bronx-only could see Queens data.
