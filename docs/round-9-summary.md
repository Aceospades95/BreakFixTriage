# Round-9 summary

## What shipped

Round-9 lands as 4 stacked commits on
`claude/breakfix-triage-audit-ZDYuJ`:

1. **`7c9679a` fix(critical):** §1A districts + §1B /scan +
   §1C HH:MM + §1D Closed column + §1E (subset).
2. **`e65eaf9` chore(polish):** Round-8 regression suite +
   §2A/§2F/§2G/§2I/§2J.
3. **`4c0af35` feat(admin):** §2C /admin/devices pagination +
   §3C codemod verify + §3D audit-row coverage extension +
   §3E read-only expansion + §3F notification dispatch audit.
4. **`docs(round-9)` (this commit):** the five docs deliverables.

## What's deferred (filed in `docs/round-9-backlog.md`)

- **Live Playwright runtime + CI Postgres** — meta-deferral that
  blocks every "live test" sub-item (Round-8 regression
  Playwright variant, §2B people block end-to-end, §3A live
  integration, §3E full UI walk).
- **§1E sub-items** — Sessions panel + Sign-out-all-sessions
  needs a `Session` schema migration (§3B).
- **§2D admin inline action menus** — large UI workstream.
- **§2E Cmd+K command palette** — large new feature.
- **§2F dynamic bulk-action selection count** — needs client-state
  refactor.

## Hard gates (final state)

- **G1 tsc** — clean.
- **G2 eslint** — clean.
- **G3 forbidden-tokens grep** — clean.
- **G4 vitest** — 458/458 (Round-9 added 61 new cases across
  3 files).
- **G7 Nav-smoke** — structural via
  `tests/not-found-links.test.ts` (R7) + R8 chromed not-found.
  Live Playwright DEFER.
- **G8 Read-only role smoke** — structural via R8 §3C +
  R9 §3E expansion test. Live Playwright DEFER.
- **G9 Driver flow audit-row coverage** — R8 §3F + R9 §3D
  extension. Real findings on parts.ts + statuses.ts fixed.
- **G10 humanise.ts library single entry point** — R9 §3C
  codemod test catches future ad-hoc humanise re-rolls. One
  real finding fixed in /admin/audit.

## Post-deploy verification protocol for Round-10

After Round-9 lands in production, the next reconnaissance pass
should walk:

1. Sign in with a typo'd password → `/admin/audit` → "Failed
   sign-ins" chip — verify a row appears with `auth:failed` action
   and the typo'd email in `after.email`.
2. Visit /admin/users/[id] → district checkboxes show humanised
   names only; hover reveals the code.
3. Visit /scan with camera permission denied → manual entry
   fallback visible → type INC2200126 + Enter → lands on
   /tickets/INC2200126.
4. Visit /me/preferences → digest hour shows HH:MM picker; save
   round-trips through cleanly.
5. Visit /tickets/kanban → Closed column at the right edge with
   any closed tickets present.
6. Visit /admin/devices → searchbox + School filter + Model
   filter + pagination controls all work; TICKETS count >0
   click-throughs to filtered list.
7. Visit /dashboards/finance with 0 outstanding POs → no emoji
   in the empty state copy.
8. Visit /tickets list → hover any truncated SUMMARY → native
   tooltip shows full string.
9. Visit /tickets/kanban with 30s auto-refresh on → see
   "refreshes every 30s · {countdown}s" caption.
10. Sign in with a clean inbox → no "0" badge on the bell.

## Persona surface verified

- Driver (Dante) — vehicle inline edit + signature pad locked.
- Repair tech (Trish) — bench aging + Closed kanban column.
- Admin (Alex) — humanise sweep + Failed sign-ins chip + devices
  pagination + parts/statuses audit rows.
- Manager (Maria) — finance prose clean + month labels.
- Warehouse (Wendy) — /scan manual entry fallback.
- Read-only (Ray) — every (app) page gated.
- Ops Manager (Pat) — HH:MM digest + auto-refresh label.

## Round-10 entrypoints

The biggest deferred items that should headline Round-10:

1. **CI Postgres + Playwright runtime** — unblocks §2B / §3A /
   §3E live tests + the R8 Playwright regression variant.
2. **Sessions schema (R9 §3B)** — unblocks the sessions panel +
   sign-out-all-sessions affordances.
3. **Cmd+K palette (R9 §2E)** — flagship new UX feature.
4. **/admin inline action menus (R9 §2D)** — surfaces the most-
   common quick actions on the /admin overview cards.

Everything else in `docs/round-9-backlog.md` rides on these or
is purely additive polish.
