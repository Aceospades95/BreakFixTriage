# Round-8 assumptions

Choices made under ambiguity. Each entry: what was unclear, what we
picked, why.

## §1A canonical case for state labels

**Ambiguity:** /admin/statuses had inconsistent capitalization
("Awaiting Pickup" vs "Pending pickup unlinked" vs "In Warehouse").
Brief asked: pick one canonical case.

**Choice:** sentence case. "Awaiting pickup", "Pending pickup
unlinked", "In warehouse", "On hold". Acronyms (RMA, SLA, etc.)
preserved upper.

**Why:** consistent with the rest of the app (humanise() output is
sentence case) and easier for non-technical operators to scan.

## §1B URL-in-prose rule scope

**Ambiguity:** the new grep gate flags `/admin/x` / `/profile/x` /
`/me/x` paths inside JSX text. Brief allows them in `href` attrs
but not in prose.

**Choice:** flag the literal substring inside `>...<` JSX text only.
`<Link href="/admin/users">` is fine; `<p>Reset from /admin/users</p>`
is not. The regex anchors on the first `/` not preceded by `\w` or
`/` so partial matches inside longer paths don't false-positive.

**Why:** keeps the gate cheap (one perl pass) and only flags the
operator-readable surface where URL-in-prose is awkward. CI can
still compose these paths in href attributes without flagging.

## §1D vehicle ref schema

**Ambiguity:** brief allowed "free-text field plus an optional
preset list pulled from a small Vehicle table or Settings".

**Choice:** keep `Route.vehicleRef` as a free-text string column
(unchanged from R4 schema). The new `updateRouteVehicleAction`
writes the string + audits.

**Why:** Round-7 forbids scope expansion and a Vehicle table /
Settings preset list is a list-page workstream of its own. Filed
as Round-9 backlog item.

## §1E people page time picker form data

**Ambiguity:** integer minutes-since-midnight was the existing
contract; HH:MM is the new form. Existing /me/schedule popover
still posts integer values.

**Choice:** `createScheduleBlockAction` now preprocesses both
forms. HH:MM strings go through `coerceTimeToMinutes`, integers
pass through unchanged.

**Why:** zero callers break, cleanest forward path.

## §1E acronym list growth

**Ambiguity:** "PTO" rendered as "Pto" because humaniseEnum's
acronym list only carried RMA / SLA / etc.

**Choice:** extend the acronym set in lib/cn.ts with PTO, OOO,
TOTP, URL, API, CSV, INC. Each is documented in the
docs/humanise-allowlist.md updated alongside this round.

**Why:** these are all acronyms operators recognise on sight;
keeping them upper preserves readability.

## §3A schema-light audit-only path

**Ambiguity:** brief asked for last-sign-in column + recent
sessions panel + failed sign-in filter + email-log resend. Each
needs either a schema migration or fresh DB seed data.

**Choice:** ship the foundational sign-in audit hook (NextAuth
events.signIn) + the /admin/users last-sign-in column derived
from AuditLog. Defer the sessions panel, failed-signin filter,
and email-log resend — each is its own workstream and the
audit hook is the data source they all read.

**Why:** the audit-only path needs no schema migration and yields
data the deferred items can display once they ship.

## §3B first-run trigger placement

**Ambiguity:** where to call `ensureFirstRunSetup()`. Options:
middleware, root layout, /signin page, an explicit admin button.

**Choice:** /signin page server component.

**Why:**
  - The first user to visit the app hits /signin (no sessions
    exist on a fresh DB).
  - The seed is idempotent + cached by AppSetting flag, so
    subsequent /signin renders cost a single AppSetting findUnique.
  - Middleware can't do DB work safely in Next.js Edge runtime.
  - The root layout runs on every authed request — wasteful.

## §3C READ_ONLY behavior verification

**Ambiguity:** brief asked for a Playwright spec that signs in as
readonly@breakfix.local and asserts every write affordance is
hidden / disabled.

**Choice:** ship structural assertions on the permission set in
lib/auth/rbac.ts (8 cases). Defer the live HTTP-level Playwright
spec to docs/round-8-backlog.md (needs Playwright runtime in CI).

**Why:** the permission set is what every gated UI surface reads.
A regression that hands READ_ONLY a write permission would surface
in this test before reaching production. The full Playwright walk
is desirable but not blocking.

## §3D humanise library placement

**Ambiguity:** brief asked for src/lib/humanise.ts with a specific
set of helpers. The existing implementations live in lib/format.ts
+ lib/audit/format.ts.

**Choice:** add a new src/lib/humanise.ts that re-exports the
existing helpers under the brief-specified names plus adds
`humanizePermission` (the new one). No codemod across the existing
import sites — both entry points coexist.

**Why:**
  - Codemod would touch every page import and is high-risk for a
    polish round.
  - Forbidden-tokens grep gate already enforces the underlying
    invariant (no raw enum render in JSX text).
  - New code can pick the canonical entry point.

## §3F audit-row coverage scope

**Ambiguity:** brief asked for asserts on Start / Arrived /
Complete / Fail / Cancel route / Reassign driver / Edit vehicle /
sign-off save / photo upload / signature save audit rows.

**Choice:** ship structural assertions for the wired actions
(Start/Arrived/Complete/Fail via updateStopStatus, vehicle update,
add/remove device, merge, importer reconcile, sign-in). Defer the
Reassign driver / sign-off save / photo upload / signature save
assertions until those flows land (filed in §1D backlog).

**Why:** structural assertions catch regressions in shipped code;
unwritten code can't have audit-row coverage.
