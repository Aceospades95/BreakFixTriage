# Round-10 assumptions

Choices made under ambiguity. Each entry: what was unclear, what we
picked, why.

## §1B SNOW INC# placeholder presentation

**Ambiguity:** brief asked the placeholder be "clearly distinguishable
from a real value (italic, lighter color, or e.g. prefix)".

**Choice:** all three — `INC#` (prefix-style), italic, reduced
opacity via Tailwind's `placeholder:italic`,
`placeholder:text-violet-400/40`, `placeholder:normal-case`.

**Why:** the input has a base `uppercase` class so placeholder
text would otherwise also render uppercase, defeating the italic
hint. The combination overrides all three so the placeholder
reads as guidance, not data.

## §1F UserSession data shape

**Ambiguity:** brief specifies fields but not nullable-ness on
ip / userAgent.

**Choice:** `ip: String?`, `userAgent: String?`. The sign-in
event hook fires before request-bound data is available; rows
land with both null until the touch middleware (deferred) adds
real ip / UA.

**Why:** the row exists from sign-in either way, panel renders
"—" / "(no user agent recorded)" until touch lands. Avoids a
chicken-and-egg where session creation requires data we don't
have yet.

## §1F Sessions panel placement

**Ambiguity:** brief says "under TWO-FACTOR AUTHENTICATION".

**Choice:** added a separate `<RecentSessionsPanel>` section
component below the 2FA section using the same `<section>`
shell. Visually grouped but conceptually separate so users
who only need 2FA management don't scroll past sessions.

## §2A command palette match scope

**Ambiguity:** brief lists nav, ticket numbers, school codes,
device serials/asset tags, user names. User-name search would
need to be hydrated client-side (the palette is a client
component) — extra work for a small win.

**Choice:** ship nav + ticket + school + device matches. User-
name fuzzy search filed in `docs/round-10-backlog.md` since it
needs an API endpoint that returns a name-only list (without
exposing emails to non-admin roles).

**Why:** R10's no-PARTIAL rule means any feature not fully
shippable should DEFER. The user-name match needs a privacy-
aware API; the rest land cleanly in a static list.

## §2H seed orchestration

**Ambiguity:** the existing prisma/seed-email-templates.ts
top-level calls `main()`. Importing it into prisma/seed.ts
would re-run the side-effect.

**Choice:** wrap the dynamic import in try/catch so the
top-level main() still runs (it's idempotent — every step
upserts) and any process.exit it triggers gets swallowed.

**Why:** least invasive. Refactoring the existing seed-email-
templates to expose a callable function would change its
self-contained shape (the Round-5 §3.3 lockstep pattern).

## §3F `rule(year-literal)` scope

**Ambiguity:** brief says "outside of audit timestamps". My
heuristic regex looks at JSX text only (between `>` and `<`),
so audit timestamps in `<LocalTime date={…}>` don't match.

**Choice:** flag any 20[2-9][0-9] inside JSX text. False
positives would be e.g. "in 2025-2026 we…" in a footer; those
are exactly the cases the brief calls out as needing
`new Date().getFullYear()`.

**Why:** simpler than year-range exemptions; the gate runs
clean on the current tree so we know there are no false hits
today.
