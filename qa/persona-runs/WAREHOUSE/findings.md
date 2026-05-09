# WAREHOUSE — static walkthrough findings

Test user: `warehouse@breakfix.local` / `breakfix-dev` (`Wes Warehouse`).

## Reachable navigation
- `/` (My Day) — non-manager view.
- `/tickets`, `/tickets/[id]` — read + transition.
- `/bench?scope=me` — own bench.
- `/scan` and `/scan/warehouse` — primary daily tool.
- `/quotes`, `/dashboards` — read.
- `/profile`, `/notifications`.

## Issues observed

### `/scan/warehouse` is the canonical scan-in surface (S4 only)
- The scan flow updates a ticket from `PICKUP_SCHEDULED` →
  `IN_WAREHOUSE`, which the state machine allows. Implemented in
  `src/server/actions/warehouse.ts`. Spot-checked; no S1/S2 issues.

### Inventory queue split across multiple states
- The legacy "INVENTORY" sheet maps to several states
  (IN_WAREHOUSE / DIAGNOSIS / AWAITING_PARTS / PARTS_ORDERED /
  IN_REPAIR / REPAIR_COMPLETED) — the warehouse user has to switch
  between filtered views in `/tickets?state=...` to see them all,
  there's no "Inventory" group. Filed in `docs/proposed-issues.md`.

## Not exhaustively tested
- Camera-permission flow on `/scan/*`. Static walkthrough only.
- Part movements / consumption (`src/lib/parts/`). Covered by
  `tests/parts.test.ts`.
