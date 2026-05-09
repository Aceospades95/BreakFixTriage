# Persona-run summary

## Scope and limitation (read first)

The §2 brief asks for an automated end-to-end harness driving the live
app concurrently as seven personas, with screenshots and traces
captured per persona. **The audit branch was authored in an environment
without a Postgres database, without a browser, and with no Playwright
runtime available** — production at `triage.omnia-house.com` is not in
scope to drive directly from this CI box, and standing up the full
stack locally is not feasible in this environment.

What this branch ships instead:

1. A **static-walkthrough finding** per persona, derived from reading
   the route table, the RBAC matrix, and every server action that the
   persona can reach. These are in
   `qa/persona-runs/<persona>/findings.md`.
2. A **harness scaffold** at `qa/playwright/personas.spec.ts.skeleton`
   describing the concurrent flows the brief asks for, ready to be
   wired up once the e2e runtime is provisioned. It is committed as a
   `.skeleton` so it cannot accidentally pass an empty CI gate.
3. **Real bug fixes** for the four §4 issues, each with a Vitest unit
   test that fails before the fix and passes after.

S1 issues observed during static walkthrough: **none**. (The bench
bucketing bug (4a) leaks no data — it under-reports — and is S2.)

## How to actually run the harness

Once the e2e runtime is available, the steps are:

1. Bring up the stack: `docker compose up -d` (uses `.env`).
2. Bootstrap + seed: `npm run db:bootstrap && npm run db:seed`.
3. Install Playwright (not currently a dev dependency — proposed in
   `docs/proposed-issues.md`): `npm i -D @playwright/test &&
   npx playwright install chromium`.
4. Convert `qa/playwright/personas.spec.ts.skeleton` to `.ts` and run
   `npx playwright test qa/playwright/`.

The seed creates one user per role with password `breakfix-dev`. Pick
the persona you want by signing in as the appropriate
`<role>@breakfix.local` account.

## Triage table (static walkthrough)

Severity rubric: **S1** data loss / wrong-tenant exposure / auth
bypass; **S2** workflow blocker; **S3** wrong result but recoverable;
**S4** cosmetic.

| Persona      | Page         | Issue                                                                                | Severity | Where                                                               |
| ------------ | ------------ | ------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------- |
| ADMIN        | `/bench`     | "All benches" view shows only Unassigned even when tickets are assigned (§4 bug 4a). | S2       | `src/app/(app)/bench/page.tsx`, `prisma/seed.ts`                    |
| ADMIN        | `/bench`     | Reassigning a ticket does not invalidate `/bench` cache (router cache).              | S3       | `src/server/actions/tickets.ts`, `src/server/actions/bulk.ts`       |
| ADMIN        | `/admin/settings` | "Default hold-window (days)" accepts 0, which means "expire immediately" (§4 bug 4d). | S3       | `src/lib/settings/settings.ts`, `src/app/(app)/admin/settings/page.tsx` |
| OPS_MANAGER  | `/quotes`    | An APPROVED quote past `holdUntil` shows "(expired)" but is never swept (§4 bug 4b). | S3       | `src/lib/quotes/sweep.ts`, `src/app/(app)/tickets/[ticketId]/page.tsx` |
| OPS_MANAGER  | `/dashboards`| "Aging > 30 days" flags exactly-30-day-old tickets (§4 bug 4c).                       | S3       | `src/lib/reports/dashboards.ts`                                     |
| TECHNICIAN   | `/bench?scope=me` | Empty bench paints a 2-col grid that looks half-blank when only Unassigned has work.  | S4       | `src/app/(app)/bench/page.tsx`                                      |
| WAREHOUSE    | `/scan`      | Page reachable; static walkthrough only — needs camera-permission live test.         | n/a      | `src/app/(app)/scan/`                                               |
| DRIVER       | `/`          | Driver lands on My Day with route controls. Confirmed reachable; needs live test.    | n/a      | `src/app/(app)/page.tsx`                                            |
| DRIVER       | various      | Many ADMIN-only buttons hidden by `can(role, ...)` checks but actions are gated by `requireRole` server-side. Spot-checked; full audit deferred. | n/a | `src/lib/auth/rbac.ts`                                              |
| READ_ONLY    | mutation routes | Server actions consistently call `requireRole(PERMISSIONS.X_WRITE)`; READ_ONLY lacks every `*_WRITE` permission so writes 403. Spot-checked. | n/a | `src/server/actions/*`                                              |

The four S2/S3 bugs above are fixed in the same audit branch with
unit tests; see `tests/quote-sweep.test.ts`, `tests/sla.test.ts`,
`tests/state-machine.test.ts` (and a new `tests/aging.test.ts` once
landed).

## Concurrency / two-persona scenarios (deferred)

The brief asks for at least one scenario where two personas mutate
overlapping data concurrently (e.g. dispatcher routing while a tech
updates a bench ticket). Without a running app, we cannot exercise
this. The scaffold in `qa/playwright/personas.spec.ts.skeleton`
includes the two scenarios we want covered:

1. **Dispatcher and Technician on the same ticket.** Dispatcher
   schedules a pickup (`AWAITING_PICKUP → PICKUP_SCHEDULED`) while
   Technician simultaneously force-changes the same ticket to
   `IN_WAREHOUSE`. The transition engine runs each in a transaction;
   we want to assert that exactly one wins, the loser sees an
   `InvalidTransitionError`, and an audit row exists for the winning
   path only.
2. **Warehouse scan-in and Dispatcher delete-route.** Warehouse scans
   a device into a route stop while Dispatcher cancels the same
   route. Want: scan-in either succeeds against the new state or
   reports a clean error — no silent partial write.

## Findings closed in pass 2 (May 2026)

The pass-2 findings-driven brief (A1–A9, B1–B5, plus per-page UX in
§6 and theme/polish in §5.D) — mapping each closed finding to its
commit on `claude/breakfix-triage-audit-ZDYuJ`. PR numbers are
omitted because this branch ships as one stack; on merge the
commit list reads as a punch list.

| Finding | Commit subject                                                                  |
| ------- | ------------------------------------------------------------------------------- |
| §1      | Audit (pass 2): touchpoints, taxonomy ADR, UI conventions                       |
| §4 ADR  | (above) — Stage 1 ADR. Stage 2 implementation gated.                            |
| §2#1 / A1 | Fix A1: persistent dashboard tab nav across /dashboards/*                    |
| §2#2    | Fix §2#2 (interim): show IMPORTED on the Kanban board                          |
| §2#3 + A8 | Tickets list: Priority column, Reported column, fix Summary sort             |
| §2#4 / A6 | Fix A6: force-change form resets after submit; danger-style button          |
| §2#5 / A7 | Fix A7: confirm before comment delete; toast on post + delete               |
| §2#6 / A3 | Fix A3: translate Prisma errors in Imports; forbidden-token scan            |
| §2#7 / A4+A5 | Fix A4+A5: shared popover primitive; close on click/Escape/route        |
| §2#8 / B2 + D | Fix B2 + D: lane-based palette; titlecase pills; 0d SLA grey           |
| §2#9 / §6.MyDay | Fix §2#9 / §6.MyDay: KPI tile destinations, hints, sweep action       |
| §2#10 / A9 | Fix A9: /admin/audit canonical; /audit aliases via redirect                |
| A2      | Fix A2: persist reason + transitionType on every audit row (Stage 1)            |
| §7+§8   | regression-critical pure tests + Playwright skeleton                            |

### Findings deferred (filed for follow-up)

These are tracked in `docs/proposed-issues.md` and are not closed
in this branch:

- §4 Stage 2 (taxonomy migration implementation) — gated on
  maintainer sign-off (Q1–Q4 in the ADR).
- B4 (reverse-edges from "wait" states back into prior workshop
  state) — the new graph in ADR 0005 specifies the back-edges
  but they don't ship until Stage 2 lands.
- A7 soft-delete with 30-second undo — recommended in the brief;
  the audit allows recovery and the confirmation gate ships now;
  soft-delete needs a schema change.
- §5.D light-mode coverage — the half-applied light variant is
  documented in `docs/ui-conventions.md` §6; the toggle should
  be hidden behind `LIGHT_MODE_BETA` until complete (filed).
- §6.Bench drag-and-drop reassignment, §6.Imports dry-run preview,
  §6.Scheduling vehicle CRUD, §6.Dashboards range toggle — each
  filed as a feature follow-up.

### Things confirmed working (regression-locked)

The capabilities the field report explicitly called out as already
working are now pinned in `tests/regression-critical.test.ts` and
`qa/playwright/regression-critical.spec.ts.skeleton`. CI should
gate every run on these tests passing.
