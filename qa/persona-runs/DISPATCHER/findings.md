# DISPATCHER — static walkthrough findings

Test user: `dispatch@breakfix.local` / `breakfix-dev` (`Dana Dispatcher`).

## Reachable navigation
- `/` (My Day) — manager view (DISPATCHER counts as manager in
  `src/app/(app)/page.tsx::isManager`).
- `/tickets`, `/tickets/[id]`, `/tickets/kanban` — read + transition.
- `/bench?scope=all` — read.
- `/scheduling` — full read/write (build routes, set windows).
- `/duplicates` — resolve (dispatcher does not have
  `DUPLICATES_RESOLVE` by default — see issue below).
- `/imports`, `/imports/new` — read only by default.
- `/quotes` — read only by default.
- `/dashboards` — read.

## Issues found

### Duplicates resolution gap (S3)
- **Where:** `src/lib/auth/rbac.ts::DEFAULT_ROLE_PERMISSIONS`.
- The `DISPATCHER` role does **not** have `DUPLICATES_RESOLVE`. Yet
  duplicate handling is squarely a dispatch-shop responsibility in the
  legacy spreadsheet workflow ("review and merge"). The dispatcher
  loads `/duplicates` (because `requireRole(PERMISSIONS.DUPLICATES_*)`
  is not on the read path), but every action button is disabled.
- **Recommendation:** add `DUPLICATES_RESOLVE` to the DISPATCHER
  default. Filing as a proposal in `docs/proposed-issues.md`; not
  changed in this audit branch because it widens permissions without
  the maintainer's sign-off.

### Tickets bulk actions
- `bulkAssignAction` writes its own audit entry. The brief asks for a
  "required reason field" on bulk reassign; today the reason is
  optional. Filed in `docs/proposed-issues.md`.

### Kanban DnD
- `src/components/kanban-board.tsx` exists and the route does render
  a board. The drop handler posts to
  `/api/tickets/[id]/transition`. That endpoint runs through the
  state machine and writes an audit row, so persistence is correct.
  **Static walkthrough cannot exercise drag-and-drop interactions** —
  needs a browser test.

## Not exhaustively tested
- Building a route end-to-end (route → stops → assign → optimize →
  send to driver). Unit-tested via `tests/optimizer.test.ts` and
  `tests/google-routes.test.ts`.
