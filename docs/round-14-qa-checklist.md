# Round-14 QA checklist

Verification protocol for the R14 changes, runnable against any
deployed instance. Prereqs: `npm run db:seed:test` fixtures.

## Authorization wave

1. Sign in as Ray (read-only) → type `/admin` → land on the chromed
   **Access denied** page at /forbidden, showing "Read only" role
   and `users:manage` in a code chip. No error boundary, no
   "Something went wrong".
2. Ray → `/invoices` → **200**, invoice queue renders, no
   attach-PO / mark-invoiced forms.
3. Sign in as Olivia (ops manager) → `/admin/email-log` and
   `/admin/email-templates` → both **200**; the admin sidebar shows
   ONLY "Email templates" + "Email log".
4. Olivia → `/admin` (overview) or `/admin/users` → /forbidden.
5. `curl -s -o /dev/null -w "%{http_code}" $BASE/api/exports/users`
   with Ray's cookie → **401**.

## Routes index graduation

6. Any role → `/scheduling/routes` → real index (not 404): filter
   pills Active / Completed / Cancelled / All with tabular counts,
   table rows linking to route detail.
7. Dana (dispatcher) sees the **Build route** button; Ray and Dante
   don't.

## Not-found chrome

8. `/admin/foobar-nonsense` (any role) → branded "Page not found"
   with Common destinations grid + HTTP 404 (root-level).
9. `/tickets/INC9999999` → chromed in-app 404 with sidebar.

## Bench pick-up

10. Sign in as Tess (technician) → `/bench` → "My bench" plus an
    **Unassigned queue (N)** section with Pick up buttons.
11. Click Pick up → ticket moves to My bench; audit log shows
    `ticket.pick_up` attributed to Tess.
12. Ray sees no Unassigned queue and no Pick up buttons.

## Fixtures

13. `npm run db:seed && npm run db:seed:test` (in that order, twice)
    → no P2002; second pass is a no-op.
14. After seed: a PLANNED route "TEST-VAN-1" for Dante exists with
    2 stops + StopDevice rows; one SENT quote on an IN_REPAIR INC9*
    ticket; every INC9* ticket has a linked SN-TEST-* device.

## Suites

15. `npx tsc --noEmit` — clean.
16. `bash scripts/check-forbidden-tokens.sh` — clean.
17. `npx vitest run` — all green (853 active).
18. `DATABASE_URL=… npm run test:integration` — 19 passed, only the
    4 Mailpit-gated dispatch cases skipped.
19. `npx playwright test` — 140 run / 1 fixme (notification-dispatch,
    B12). Includes: 50-route smoke matrix, 18 readonly-403, 24
    contrast, 14 persona walks, theme picker, 2FA reset, not-found
    chrome, block-create.
