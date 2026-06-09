# Round-15 QA checklist

Verification protocol for the R15 changes. Prereqs:
`npm run db:seed && npm run db:seed:test`.

## Email pipeline (the headline fix)

1. Sign in as Alex → /tickets → quick-create from "Cracked screen
   (test)" at Test School TEST-101 → redirected to
   `/tickets/LOCAL…` (incident number in the URL, not a cuid).
2. /admin/email-log → top row shows the new LOCAL incident,
   recipient `spoc-test101@example.test`, status Queued — NOT
   "(skipped)" / failed / "template variable mismatch".
3. /admin/statuses → enable notify-on-enter for In repair → move
   any DIAGNOSIS ticket to In repair (with a ticket-scoped
   status_in_repair rule) → email-log row shows subject
   "Ticket <INC#> is now in repair" with a populated school name.
4. Open any email-log row → the body's link is absolute
   (`https://…/tickets/<INC#>`), not `/tickets/<cuid>`.

## Exceptions dashboard (B26)

5. Sign in as Alex → admin sidebar shows **Exceptions** directly
   under Overview → six sections render, each with a count pill;
   empty sections read "Clear."
6. Ops manager (Olivia) does NOT see the Exceptions link and gets
   /forbidden navigating directly.

## People directory (B11)

7. Any role → /people → staff table with roles, open-ticket
   counts; counts link to `/tickets?assignee=…`; admin column
   links only render for ADMIN.

## Accessibility (B9)

8. `npx playwright test e2e/axe-sweep.spec.ts` → 24/24, empty
   allowlist.
9. Light mode spot-checks: secondary text (slate-500 surfaces) is
   visibly darker than before; SLA "parts" pill text is deep
   orange, not cream; PTO/Training chips on /scheduling/people are
   readable; profile password fields announce their labels.

## Seeds

10. `npm run db:seed && npm run db:seed:test` twice — idempotent;
    /scheduling/people shows "Theo Technician" (dev) and "Tess
    Technician" (test) as distinct rows.
11. `npm run test:integration` (with DATABASE_URL) → 24 passed,
    nothing skipped.

## Suites

12. `npx vitest run` — all green.
13. `npx playwright test` — all green, zero fixme (verify with
    `grep -rn "test.fixme" e2e/` → no hits).
14. `bash scripts/check-forbidden-tokens.sh` — clean.
