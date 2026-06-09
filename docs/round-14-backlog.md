# Round-14 backlog

Filed during R14 — to ship in R15 or later. R13 items not listed
here either graduated this round (B8, B14, B15, B16, integration
todos) or carry forward unchanged.

## Carried forward from R13

- **B5 + B6** — admin device-models bulk import (CSV upload +
  dedupe) and parts inventory levels UI. Unchanged.
- **B9** — full axe-core contrast walk. The R13 hand-rolled floor
  now runs green across all 24 (page × theme) combinations; the
  per-element WCAG 2.2 sweep still needs `@axe-core/playwright`,
  which couldn't be installed this round (registry policy blocks
  new browser downloads — same constraint that pinned
  `@playwright/test`; see R14 assumptions).
- **B10 + B12** — Mailpit fixture. `notification-dispatch.spec.ts`
  (1 test) and the 4 `dispatch-email-event` integration cases are
  the only remaining gated specs in the whole suite.
- **B11** — `/people` graduation to a real directory page.
- **B13** — audit string normalisation. R14 re-confirmed the mixed
  formats (`transition:IMPORTED->TRIAGE`, `ticket.pick_up`,
  `2fa:admin-reset`, `snow-merge.runner-up`, bare verbs). Needs a
  dedicated sweep + historical-row migration.
- **B17** — remaining `*ForSession` tenant-scoping conversions
  (CSV exports, /bench, /dashboards/*, /notifications).
- **B19-B31** — unchanged from the R13 security-pass list.

## New in R14

- **C1 — duplicate persona display names across seeds.** `seed.ts`
  (tech@breakfix.local) and `seed-test.ts` (tess@example.test) both
  name their technician "Tess Technician"; a dev DB with both seeds
  shows two identical rows on /scheduling/people. The block-create
  spec works around it with `.first()`. Fix: distinct display names
  for the dev-seed personas (rename ripples through round docs, so
  it needs its own pass).
- **C2 — persona spec depth.** The R11 + R13 persona specs are all
  active now, but several assertions are still breadth-level
  (page reachable, affordance visible). The R13 §2 deep-walk
  ambitions (full kanban drag, route optimise click, quote
  approve→invoice loop) remain unwritten.
- **C3 — route index empty-state CTA.** The new /scheduling/routes
  page shows a "Build route" header CTA when the operator holds
  ROUTES_BUILD; the EmptyState body mentions it but doesn't render
  a button. Cosmetic.
- **C4 — in-segment notFound() returns HTTP 200.** Because the
  (app) segment streams via loading.tsx, `notFound()` thrown by a
  page commits status 200 with the chromed 404 body (the root-level
  404 for unmatched URLs returns a real 404). Acceptable for an
  authed app (robots noindex) but worth revisiting if SEO or
  monitoring ever cares; would mean dropping the loading boundary
  or moving missing-entity checks ahead of first flush.
- **C5 — two "Pick up" queues for managers.** Managers see the
  unassigned queue in both the scope=all column and (new in R14)
  would on scope=me if they switch manually. Harmless duplication;
  consolidate if the bench page gets its R12-deferred kanban
  treatment.
