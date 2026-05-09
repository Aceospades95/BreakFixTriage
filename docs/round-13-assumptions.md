# Round-13 assumptions

This file captures the interpretation calls made during the R13
security and correctness pass. Every entry pairs a question raised
by the R13 prompt with the choice made and the rationale.

## §1A — `sessionRevokedBefore` vs per-session `jti`

**Question:** the R13 prompt offered two designs for revocation
enforcement: a coarse cutoff timestamp on User
(`sessionRevokedBefore`) or a per-session JWT id (`jti`) tracked
on `UserSession` for fine-grained revocation.

**Decision:** ship `sessionRevokedBefore`.

**Rationale:** the existing UI affordance is "Sign out ALL
sessions". It nukes every active row at once. The coarse cutoff
matches the affordance — there's no "Sign out THIS device" button
to support. `jti` is the right granularity once we add a per-row
sign-out, which is filed as R14 backlog.

A second consideration: `sessionRevokedBefore` plays cleanly with
the 2FA-reset cascade (§1B). Resetting 2FA bumps the cutoff in the
same transaction; the user is forced through re-enrollment AND any
cached JWTs are invalidated. With `jti` we'd need a separate
"revoke all jtis for this user" mechanism, which adds complexity
without behaviour gain at this UI surface.

ADR 0015 documents the alternative considered.

## §1F — synthetic-merge import reconciliation boundary

**Question:** the R12 round-12-summary claimed the merge
"transactionally transferred devices, signatures, photos, comments,
and audit history". The independent review found this overstated:
only StopDevice repointing + closure + the merge-event row are in
the same transaction. Attachments, comments, and inter-school
breadcrumbs ride the eventual-consistency boundary.

**Decision:** document the actual boundary; do NOT extend the
transaction.

**Rationale:** wrapping the runner-up comments + cross-school
breadcrumbs into the merge transaction would create lock contention
on big imports (a single batch can have hundreds of synthetic
tickets). The pragmatic guarantee is "merge is tight; reconciliation
is eventually consistent and idempotent on retry". Idempotency keys
on runner-up comments and `failed_merge` audit rows make the retry
case safe.

R13 ships the documentation update (top of `lib/imports/reconcile.ts`
once the file lands the §1F change). The legacy R12 invariant claim
is corrected.

## §1J — audit column schema

**Question:** the R13 prompt promotes `reason`, `transitionType`,
`requestId`, and `severity` from JSON-buried `before`/`after` to
top-level columns. Should the legacy JSON mirror be retained?

**Decision:** retain the JSON mirror for a deprecation window.
Existing render paths in `lib/audit/format.ts` read the JSON; the
column promotion ships with the columns populated AND the JSON
fields preserved so the render path keeps working without a
parallel migration.

**Rationale:** the column promotion is the structural fix; the
render path migration is a separate change with its own risk. The
24-hour deprecation window is generous; we can drop the JSON
mirror in R14 once the render path reads columns.

The migration backfill is idempotent: it checks if the column
already has a value before overwriting from JSON. Re-running the
migration on a populated DB is a no-op.

## §2A — partial conversion to `*ForSession` helpers

**Question:** the R13 prompt acknowledges that full conversion of
every read path stretches across rounds. Which paths ship in R13?

**Decision:** R13 ships the helpers and converts the highest-leak
hot paths flagged by the reviewer:

- `/api/search` (§1C)
- `/api/attachments/[id]` (§1D)

**Rationale:** these are the two paths where the leak was
demonstrably exploitable. CSV exports, bench, dashboards, and the
audit log all read tenant-scoped data but they're either gated by
`requireRole` already (admin paths) or filter via the existing
ticket query (which gets the helper in R14).

R14 conversion roadmap is documented in ADR 0014.

## §2E — offset pagination deferral

**Question:** when do we migrate ticket-list, audit-log, and bench
queries from offset to cursor pagination?

**Decision:** defer until tickets > 5,000 OR p95 list-render > 800ms.

**Rationale:** offset pagination is acceptable at the current scale.
The instability under concurrent writes (rows shifting between
pages) has not produced a reported issue. R13 caps the manager
bench at 200 tickets per assignee with a "Showing first 200 of N"
disclosure; users hitting the cap link to `/tickets?assigneeId=X`
for the full list.

Filed in `docs/round-13-backlog.md` with the trigger condition
documented for R14+ planning.

## §2I — grep-gate freeze policy

**Question:** the forbidden-tokens grep gate is at v5 (R13 §4A
shipped two new sub-rules: `parens-enum`, `snake-case-token`).
Should future leaks add new rules?

**Decision:** freeze new sub-rules at v5. Component-render tests
become the primary protection for new leak surfaces.

**Rationale:** the reviewer's framing was correct: a literal-leak
tripwire is easily bypassed with computed strings. Adding a new
grep rule for every escape pattern produces a brittle gate that
catches the pattern but not the leak. A component-render test
asserts the actual visible output and survives refactors that
change the source pattern.

The existing v5 rules stay as a tripwire for the categories they
already cover. New leak surfaces ship with a render test in
`tests/round-13/render-invariants.spec.tsx` (deferred to R14).

## §2L — portal data scope

**Question:** portal pages expose serial numbers, asset tags, and
ticket descriptions to anyone with the bearer link. The R13 prompt
offered two options:

- (a) Add a `dataScope` field to `PortalToken` with `STANDARD` /
  `MINIMAL`, default `STANDARD` for backward compat.
- (b) Always strip serials/asset tags/descriptions from portal
  output.

**Decision:** option (a).

**Rationale:** option (b) reduces utility for the existing use case
(school IT lead checking a queue of repairs in flight) and would
require a privacy review for the change. Option (a) preserves the
current behaviour and gives admins a deliberate "Minimal" choice
for sensitive sharing.

Existing tokens default to `STANDARD` via the migration default
column value. New tokens are issued via the form on
`/admin/schools/[id]` with a `Data scope` select. Portal pages
read `dataScope` and hide sensitive fields when `MINIMAL`.

## Round-13 carry-overs from R12 §1G

**Decision:** keep the R12 §1G privacy-by-design choice on
hashed IP/UA. R13 §3H (recent sessions panel) was deferred to
backlog; the R13 entrypoint of "Unknown device" fallback for
missing data still ships from the prior R13 sidebar/leak commit.

**Rationale:** documented in `docs/round-13-decisions.md` (the
prior R13 round). Reversing the privacy choice requires a fresh
privacy review.
