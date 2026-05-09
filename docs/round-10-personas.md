# Round-10 personas

Refresh of the Round-9 persona surface. Each persona's path
through the app is unchanged; the new pages/affordances introduced
this round are noted under the relevant role.

## Driver (Dante)

Sign-in path: `/signin` → My day → `/scheduling/routes/{id}`.

Round-10 changes:
- Cmd+K command palette (R10 §2A) — type "INC2200126" + Enter
  to jump to a ticket from anywhere on the route.
- SLA pill tooltip (R10 §2I) — hover any badge to see
  "Reported {date} · {N}d in {state} · threshold {N}d" without
  clicking into the ticket.

## Repair tech (Trish)

Sign-in path: `/signin` → My day → `/bench`.

Round-10 changes:
- Pick up button (R10 §2F) — claim an unassigned ticket in one
  click without navigating into the detail page.
- Cmd+K palette + SLA tooltip (same as driver).
- Ticket SUMMARY tooltip (R10 §2J locked in).

## Admin (Alex)

Sign-in path: `/signin` → My day → `/admin/*`.

Round-10 changes:
- /admin/users/[id] Recent sessions panel (R10 §1F) — last 10
  sessions with timestamp + IP + UA + active/revoked tag.
  "Sign out all sessions" button when at least one is active.
- /duplicates contradictory empty state fix (R10 §1A).
- /duplicates SNOW INC# placeholder (R10 §1B).
- /admin/holidays District microcopy (R10 §1D) — disables when
  Scope=Global, helper text replaces programmer notation.
- /tickets/kanban Closed column (R9 §1D, locked in by R10
  regression suite).
- Email rules + email templates seed-on-empty banner (R10 §2G).

## Manager (Maria)

Sign-in path: `/signin` → My day → `/dashboards/*`.

Round-10 changes:
- Cmd+K palette to nav across dashboards.
- Ticket SUMMARY tooltips locked in.

## Warehouse (Wendy)

Sign-in path: `/signin` → My day → `/scan`.

Round-10 changes:
- Cmd+K palette — type "SN-…" / "AT-…" to jump to /admin/devices
  filtered.
- /scan manual entry fallback locked in (R9 §1B regression).

## Read-only (Ray)

Sign-in path: `/signin` → My day → most routes.

Round-10 changes:
- Same surface; the R9 §3E walker still asserts every (app)
  page is gated by `requireSession` / `requireRole` /
  `redirect()` / `notFound()`.

## Operator-of-people (Pat — Ops Manager)

Sign-in path: `/signin` → My day → `/scheduling/people`.

Round-10 changes:
- Keyboard shortcuts (R10 §2J): `t` (today), `[` (prev day),
  `]` (next day). Documented in the global shortcuts overlay.

## Cross-cutting

- Round-9 regression suite (R10 R9-regression test) — 18
  structural assertions guard against any Round-9 leaf
  regressing.
- Audit row coverage wave 2 (R10 §3C) — 14 explicit mutation
  surfaces locked in via structural test.
- Forbidden-tokens grep gate v3 (R10 §3F) — extended URL-in-
  prose pattern + new year-literal rule.
