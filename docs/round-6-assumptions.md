# Round-6 assumptions

Choices made under ambiguity. Each entry: what was unclear, what we
picked, why.

## §1C `/scheduling/routes` — chose Option B

**Ambiguity:** brief offered two options for the bare `/scheduling/routes`
404. Option A = real index page listing routes; Option B = catch-all
that throws `notFound()` so the chromed `/not-found` renders.

**Choice:** Option B.

**Why:** the brief explicitly forbids scope expansion in Round-6, and
Option A is a list-page workstream of its own (filter UX, pagination,
sort options, build-route CTA placement). Option B is the conservative
ten-line fix that unblocks the headline N1 flow today. Option A is
filed in `docs/round-6-backlog.md` for a future round.

## §2C Mapbox token strategy in CI

**Ambiguity:** should CI tests provision a Mapbox token for the route
detail page so the static-image branch is exercised, or always go
through the SVG fallback?

**Choice:** SVG fallback only in CI; no token wired.

**Why:** the brief calls the SVG fallback "the conservative option"
and Mapbox tokens are billed. The Round-5 forbidden-tokens scan +
Round-6 §3C gate already cover the env-var-name-must-be-inside-
`<code>` invariant. Live-tile rendering is filed in `round-5-backlog.md`.

## §2E RouteStop chip URL fragment

**Ambiguity:** brief says `/scheduling/routes/{routeId}#stop-{stopId}`.
The route detail page doesn't currently emit `id="stop-{stopId}"` on
each stop card.

**Choice:** ship the URL with the fragment. The route detail page
will gain matching `id="stop-{stopId}"` anchors when a stop-detail
work item lands; until then the fragment is a no-op (graceful) and
the click-through still navigates to the right route.

**Why:** filing the anchor as a docs note rather than expanding
this round's scope. The audit chip click-through works either way.

## §2E Persisting `routeId` for older audit rows

**Ambiguity:** the brief mentions adding a `parentEntityId` column to
`AuditLog` so older `RouteStop` rows can resolve to a route URL.

**Choice:** no schema migration this round. Older rows render
copy-only; new rows (after this commit) carry `routeId` in the
`after` JSON blob.

**Why:** the audit log is append-only; backfill is a separate
operation that needs a one-time migration script. Filed in backlog.

## §3A `EmailRule` seeding

**Ambiguity:** brief asks for "EmailRule rows seeded as defaults: one
per event, scope=GLOBAL, enabled=false".

**Choice:** ship the four `EmailTemplate` seeds (so admins clicking
"Seed default templates" on a fresh DB get the new rows). Skip the
auto-rule seeding; admins create rules manually via
`/admin/email-rules` per the existing flow.

**Why:** existing `seedExampleRuleAction` is single-event (`ticket_created`)
and adding a fourth (`status_*`) action mirroring it is its own
workstream. Filed in backlog as "Auto-seed default `EmailRule`
rows for the four §3A events".

## §3B Print Work Order barcode

**Ambiguity:** brief calls for a barcode of the ticket number using
`bwip-js` "or repo equivalent — match the route Print sheet pattern".

**Choice:** no barcode this round. The print page renders the INC#
in large type at the header, which is the same pattern the route
Print sheet uses (no barcode there either).

**Why:** `bwip-js` isn't a dependency today; pulling it in for one
view balloons the bundle. The INC# in 24pt monospace at the top of
the work order is functionally equivalent for human reading, and a
follow-up that adds barcoding to both the route Print sheet and
this view is the right scope.

## §3B Audit `note` field

**Ambiguity:** brief says the audit row should carry
`note='manual_email_to_spoc'`. The `AuditLog` model has no `note`
column; Round-2 onwards the convention is to use `action` for the
slug and either `reason` (free-text) or `after.*` (structured) for
context.

**Choice:** `action='manual_email_to_spoc'`, `reason='Manual SPOC
update from {actor.name}'`, `after={recipients, subject}`.

**Why:** matches the existing audit-write convention used by
`merge`, `unmerge`, `route.stop.device.removed`, etc. A future
schema migration that promotes `reason` + `action` to dedicated
columns (ADR-0006 plan) doesn't change the grep-ability.
