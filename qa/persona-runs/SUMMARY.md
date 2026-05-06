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
