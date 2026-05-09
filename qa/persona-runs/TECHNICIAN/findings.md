# TECHNICIAN — static walkthrough findings

Test user: `tech@breakfix.local` / `breakfix-dev` (`Tess Technician`).

## Reachable navigation
- `/` (My Day) — non-manager view: own queue, no ops-attention KPIs.
- `/tickets`, `/tickets/[id]` — read + transition (no general
  `TICKETS_WRITE`, so no inline edits to priority, etc.).
- `/bench?scope=me` — own bench (default for non-manager roles).
- `/quotes` — read.
- `/dashboards` — read.
- `/scan` — QR scanner.
- `/profile`, `/profile/2fa`.
- `/notifications`.

## Issues observed

### Bench shows "All benches" link even though TECHNICIAN can't open it (S4)
- **Where:** `src/app/(app)/bench/page.tsx`.
- `canSeeAll = can(role, TICKETS_WRITE) || OPS_MANAGER || ADMIN`.
  TECHNICIAN does not have `TICKETS_WRITE`. The "All benches →" link
  is only rendered when `canSeeAll`, so this is fine — flagged as a
  no-op.

### Empty bench grid layout
- When no work is assigned to the technician AND the seed has no
  unassigned `IN_WAREHOUSE`/`QUOTE_REQUIRED` tickets to fall through
  to, the page renders the EmptyBench panel which directs the user
  to `/tickets?state=TRIAGE`. Confirmed reasonable.

### Time tracking
- Start/stop timer is on `/tickets/[id]`. The timer header banner
  appears on `/` when an unfinished entry exists. Logic is in
  `src/lib/time/`; covered by `tests/time-tracking.test.ts`.

## Not exhaustively tested
- Inline transition from a bench card. Today the bench shows a state
  pill but **does not expose transition controls inline** — the user
  has to click into the ticket. That's the legacy behavior; not a
  bug.
- The state machine prevents a TECHNICIAN from forcing a transition
  outside the allowed graph. Covered by `tests/rbac.test.ts` and
  `tests/state-machine.test.ts`.
