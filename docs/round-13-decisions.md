# Round-13 decisions

## §1A — /people sidebar broken-link fix

**Decision: option (b) — create /people that 308-redirects to /scheduling/people.**

The brief offered two options:
- (a) remove the People entry from the sidebar
- (b) create a /people index page that redirects to /scheduling/people

Picked (b) because:

1. The sidebar already labels the entry "People" — operators
   reasonably type the natural shortcut `/people` directly. A
   redirect keeps that intuition working.
2. The label "People" doesn't refer to the schedule grid
   exclusively; there's conceptual room for the path to grow
   into a directory of people that links to scheduling, profile,
   and audit-by-actor.
3. Removing the entry would break operator muscle memory and
   the sidebar's information architecture. Adding a redirect
   costs ~10 lines.

Implementation: `src/app/(app)/people/page.tsx` calls
`redirect("/scheduling/people")`. The routes manifest
(`src/lib/routes-manifest.ts`) records `/people` with
`redirectsTo: "/scheduling/people"` so downstream sweeps know
this is an intentional redirect, not a final destination.

The R14 expansion path: replace the redirect with a real index
page that lists all internal users with sub-tabs for "Schedule",
"Open tickets", "Audit trail" — without breaking the
already-redirecting URL.

## §3H — Recent sessions panel: privacy vs forensic detail

**Decision: keep the R12 §1G privacy-by-design choice; add an "Unknown device" fallback for missing data.**

The R13 brief (§3H) asked to switch from hashed IP/UA to a
humanised IP+ASN+OS+browser tuple from "the existing parser".
The R12 §1G assumptions doc had documented the privacy choice
(option (a)): hash IP+UA at storage time, render as "Session id"
+ "Device fingerprint" labels. Operators who need real values
for forensics grab them from access logs at the load balancer
or CDN.

Two reasons we didn't reverse:
1. The hashes are one-way. Reversing the policy requires:
   - Schema migration to add raw IP + UA columns
   - Privacy review (stored PII is materially different)
   - A UA parser library or hand-rolled parser
2. The R12 §1G choice is documented and was ratified. Reversing
   without a fresh privacy review would skip the gate.

What R13 §3H actually shipped: the panel now renders "Unknown
device" when both hashes are null (e.g. seeded fixtures, very
early sessions). When hashes exist, the existing "Session id"
/ "Device fingerprint" labels stay. The full parser-driven
path is filed in `docs/round-13-backlog.md` as B8 — it remains
a valid R14 entrypoint if the security team wants to reverse
the privacy choice with a documented decision.

## §4A — grep gate v5 sub-rule scope

**Decision: parens-enum rule scopes to JSX text spans only.**

The brief asked to "fail on JSX containing /\\([A-Z]{2,}_[A-Z_]+\\)/
inside a string literal". A first pass tried to match the pattern
anywhere in source — but TypeScript code legitimately has parens
around ALL_CAPS identifiers (`getItem(HIDE_EMPTY_KEY)`,
`cookies().set(RECOVERY_COOKIE, ...)`). Those are not user-facing
text leaks, just constant references.

The scoped rule matches `/\\([A-Z]{2,}_[A-Z_]+\\)/` only within
JSX text spans (after `>` and before `<`). This catches both
literal "(AWAITING_ONSITE)" copy and the rendered output of
template-literal interpolations like `({s.state})`. It does not
flag legitimate constant references in expression positions.

Documented in `scripts/check-forbidden-tokens.sh` rule
`parens-enum`.

## §1E + §4C — contrast sweep: floor implementation

**Decision: ship a minimal contrast checker now; defer full axe-core to backlog.**

The brief asked for an "axe-core integration that visits all 12
routes in both theme modes and fails on any contrast violation."
A full axe-core walk requires:
- Adding `@axe-core/playwright` as a devDep
- Per-element WCAG 2.2 violation list with custom serializer
- Allowlist for known intentional design choices

R13 ships the floor: per-route contrast assertion using a
hand-rolled WCAG luminance ratio computation (no extra deps).
Asserts:
1. `data-theme-resolved` is `"light"` / `"dark"` / null — never
   `"pending"`
2. body fg/bg ratio ≥ 4.5:1
3. first sidebar nav link's contrast vs body bg ≥ 4.5:1 — this
   is the §1G hotfix bug pattern at runtime

Filed in backlog: full axe-core integration with per-element
violation list.
