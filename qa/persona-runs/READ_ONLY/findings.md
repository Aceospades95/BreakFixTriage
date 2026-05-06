# READ_ONLY — static walkthrough findings

Test user: `readonly@breakfix.local` / `breakfix-dev` (`Ray ReadOnly`).

## Reachable navigation
- `/` (My Day) — non-manager view.
- `/tickets`, `/tickets/[id]` — read.
- `/bench?scope=me` — read.
- `/quotes`, `/invoices`, `/dashboards` — read.
- `/imports` — read (no `IMPORTS_RUN`).
- `/scheduling` — read.
- `/profile`, `/notifications`.

## Issues observed

### Server actions correctly gated
- Spot-checked: every server action under `src/server/actions/`
  begins with `requireRole(PERMISSIONS.<X>_WRITE)`. READ_ONLY's
  default permission set has no `*_WRITE` permission. So a malicious
  / curious user manually POSTing to a server action endpoint as a
  READ_ONLY session is rejected.
- `requireRole` returns a redirect-throwing helper; on rejection it
  redirects to `/` rather than 403 — that's the framework idiom.

### Routes hidden by the sidebar but still navigable
- `/admin`, `/duplicates` are hidden in the sidebar for non-managers
  but typing the URL lands on the page server-side, which then runs
  `requireRole(PERMISSIONS.USERS_MANAGE)` (or equivalent) and
  redirects. Confirmed by reading each page's header.

## Not exhaustively tested
- Whether **every** read view is safe to render without leaking
  cross-tenant data. The schema has District-level scoping
  (`DistrictUser`), but I did not exhaustively confirm every read
  path filters by the session user's districts. Filed as a
  follow-up audit in `docs/proposed-issues.md` — not an S1 unless
  proven.
