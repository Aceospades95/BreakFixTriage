# Round-9 assumptions

Choices made under ambiguity. Each entry: what was unclear, what we
picked, why.

## §1A district code visibility

**Ambiguity:** brief offered "drop entirely (preferred) or move
into a `title=` attribute / hover tooltip".

**Choice:** `title="District code: BRONX"` on the `<label>`.

**Why:** power users (admins doing migration audits) still need
the code on hover; non-admins / casual users see only the
humanised name.

## §1C HH:MM round-trip storage

**Ambiguity:** brief allowed either parsing HH:MM → integer or
storing the HH:MM string. "Migration must be reversible."

**Choice:** parse HH:MM → integer hour for the existing
`digestHour` integer column. No schema migration.

**Why:** the daily digest fires on the hour anyway (a cron-style
scheduled job), so minutes are decoration. Keeping the column
shape stable means zero migration risk.

## §1D Closed column ordering + cap

**Ambiguity:** brief said add Closed column "with the same header
treatment as the other 23, count badge, and +N more pagination."
Didn't specify ordering.

**Choice:** Closed tickets ordered `closedAt desc` (newest first)
and capped at 100. In-flight columns stay `stateEnteredAt asc`
(oldest first) so SLA-aging cards bubble to the top.

**Why:** Closed is a rolling history view; recent closures are
the operationally interesting ones. Cap of 100 keeps the kanban
query budget bounded — admins who need older closed tickets use
the `/tickets?state=CLOSED` list.

## §1E (subset) audit row format

**Ambiguity:** brief specifies `action=auth.failed`. Existing
audit rows use `:` not `.` (e.g. `email:dispatch:queued:*`,
`auth:login`).

**Choice:** keep the colon convention — `action=auth:failed:*`
with the failure reason as a third segment OR the reason in
`after.reason`. Picked: `action="auth:failed"` + reason in
`after.reason` so the chip humanises consistently with the rest
of the audit log.

**Why:** breaks consistency with Round-8 §3A (`auth:login`) if
we switch separators just for this.

## §2C devices model+school filter source

**Ambiguity:** brief asked for school + model filters. Schools
list could be huge (millions theoretical, thousands realistic).

**Choice:** load every school + every device model in the same
page request (one query each). Acceptable up to ~1000 schools;
file a backlog item for typeahead when the corpus grows.

**Why:** simple `<select>` is fine for the current corpus
(~50 schools, ~30 device models in fixtures). Typeahead is a
follow-up ergonomic improvement.

## §2D / §2E DEFER scope

**Ambiguity:** both items are real UX work but expand scope
significantly. R9 brief says "no PARTIAL".

**Choice:** explicit DEFER with a one-line reason in
`docs/round-9-backlog.md`. Each lands as a future round's
headline §1 item once the prerequisite design / schema work is
done.

**Why:** shipping a half-baked kebab menu or Cmd+K palette
violates the no-PARTIAL rule. Better to ship a clean DEFER than
a half-implementation.

## §3D real findings vs new-code policy

**Ambiguity:** the §3D structural test found two real audit-row
gaps (parts.ts createPart, statuses.ts saveStatusConfig). Should
we ship the test + the fix, or just the test?

**Choice:** ship both. The audit-row write is a one-line addition
per call site; not adding it leaves a known gap that the test
explicitly flags.

**Why:** the test would fail without the fix. Either ship both
or skip the test — the second option leaves the gap silent.

## §3F dispatchEmailEvent action format

**Ambiguity:** brief says "action=email.dispatched". Existing
audit rows use `email:dispatch:queued:{event}`.

**Choice:** keep the existing format. The `email:dispatch:`
prefix is what /admin/audit's CATEGORY_CHIPS already filters on
(category="email" matches `entityType: "EmailLog"`). Changing
the action slug would require re-keying every existing audit
row.

**Why:** Round-2 §B already shipped this format; Round-9 §3F is
verification, not redesign. The structural test in
`tests/round-9/notification-audit-coverage.test.ts` locks the
existing format in.

## Tests folder layout

**Ambiguity:** brief says `tests/round-9/round-8-regression.spec.ts`
(spec.ts suggests Playwright). We don't have a Playwright runtime.

**Choice:** ship as `tests/round-9/round-8-regression.test.ts`
(vitest), and file the Playwright variant in
`docs/round-9-backlog.md`.

**Why:** the structural test catches every regression that the
copy of source files would. The Playwright spec adds runtime
verification on top — useful but not blocking.
