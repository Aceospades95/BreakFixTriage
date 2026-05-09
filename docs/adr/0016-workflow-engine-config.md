# ADR 0016 — workflow engine reads StatusConfig

## Status

Accepted. Round-13 §1E.

## Context

R10 introduced `StatusConfig` (an `AppSetting` JSON blob) so admins
could override transition graphs, SLA thresholds, labels, and
section assignments without a redeploy.
`getEffectiveTransitions(state, config)` was added to merge the
hardcoded `ALLOWED_TRANSITIONS` with the override, and the admin UI
on `/admin/statuses` saved overrides.

The R13 independent review pointed out that the runtime engine
didn't read the config: `transitionTicket()` called
`canTransition(from, to)` from `lib/workflow/states.ts`, which only
consulted the hardcoded map. Saving a `StatusConfig` override in
the admin UI had no effect on actual transitions. The UI was
lying.

## Decision

`transitionTicket()` now loads `StatusConfig` per request and
applies:

1. Disabled-state rejection: if `to` is in `config.disabled`, the
   transition is rejected with a clear operator-facing message:
   "Status X is disabled. Choose another target state."
2. Effective transition graph: `getEffectiveTransitions(from, config)`
   returns `config.transitions[from] ?? ALLOWED_TRANSITIONS[from]`.
   `transitionTicket()` checks the candidate against this list.
3. Force-change override stays exactly as it was: `force: true`
   bypasses both the disabled check and the transition-graph check.
   The audit row records `severity: warn` so `/admin/audit` can
   filter for force events.

The hardcoded `ALLOWED_TRANSITIONS` map remains as the first-run
safety net. With an empty `StatusConfig`,
`getEffectiveTransitions(from, {})` returns the full hardcoded list.
This means a fresh install never has a "no allowed transitions"
state.

## Merge semantics

- A key in `config.transitions` REPLACES the hardcoded list for
  that state. There is no append/intersect mode.
- Admins who want to ADD an edge to the hardcoded list write the
  full list including the new edge.
- Admins who want to REMOVE an edge omit it from their list.
- `config.disabled` applies AFTER the per-state list — a state in
  `disabled` cannot be a transition target even if some other
  state's `transitions` entry permits it.

This is documented inline in `lib/workflow/status-config.ts` and
on the `/admin/statuses` editor.

## Caching

`transitionTicket()` calls `readStatusConfig()` once per call. The
function reads `AppSetting.findUnique({ where: { key: SETTING_KEY }})`
which is a primary-key read; cost is negligible. We deliberately
do NOT memoize across requests — bulk transitions and admin saves
need to see the latest config without a stale-cache window.

If the runtime profile shows config reads as a hot path, the
follow-up is to memoize per-request via React `cache()` (which
cooperates with Next.js's request scoping). Not in this round.

## Alternatives considered

1. **Push the merge into `canTransition`.** Make
   `lib/workflow/states.ts` read `StatusConfig` and rewrite the
   exported `canTransition()` function. Rejected because
   `states.ts` is a synchronous, pure module — used by UI
   components to render the "Next" dropdown. Pulling the DB read
   inside it forces every consumer to be async. Cleaner to keep
   `states.ts` pure (the hardcoded source of truth) and let the
   engine gate read both.

2. **Migrate `StatusConfig` from `AppSetting` JSON to a dedicated
   table.** Stronger schema; queries that join transitions are
   simpler. Rejected for R13 because the JSON blob was working
   for everything except this one runtime gap. Filed in backlog
   for a future round if config evolution adds row-level
   per-tenant overrides.

3. **Delete `StatusConfig.transitions` entirely.** The reviewer
   noted that 0% of production deploys use the override today.
   Rejected because the admin UI is documented and we don't want
   to remove a documented capability without a migration plan.

## Consequences

- An integration test (`tests/integration/workflow-engine-config.spec.ts`)
  is the executable model: save an override → call
  `transitionTicket()` → assert success/failure matches the saved
  graph. Force-change still bypasses.
- The R13 hard gate G11 enforces this in CI.
- The `/admin/statuses` UI is now truthful. Admins who change a
  graph can verify the change took effect.
- If a deploy ships with a malformed `StatusConfig`, the runtime
  reads it via `readStatusConfig()` which catches JSON parse
  errors and returns the empty default. Defensive but worth
  noting: a corrupted config falls back to "everything allowed
  except `disabled`".

## R14+ entrypoints

- `StatusConfig` migration to a dedicated table for richer
  per-tenant overrides.
- Validation: rejecting saved overrides that would create a
  graph with unreachable terminal states.
- A "preview" affordance: simulate a config change against a
  population of open tickets and show how many would have their
  next-step list invalidated.
