# Round-9 personas

Refresh of the Round-8 persona surface. Each persona's path
through the app remains the same; the new pages introduced this
round are noted under the relevant role.

## Driver (Dante)

Sign-in path: `/signin` → My day → `/scheduling/routes/{id}`.

Round-9 changes:
- Round-8 verification regression suite locks in the vehicle
  inline edit + count split + signature pad.
- Failed sign-in audit (R9 §1E) — drivers with a typo'd password
  now leave a row admins can investigate at /admin/audit.

## Repair tech (Trish)

Sign-in path: `/signin` → My day → `/bench`.

Round-9 changes:
- /tickets/kanban Closed column (R9 §1D) — terminal-state column
  at the right edge.
- Ticket SUMMARY truncation tooltip (R9 §2J) — hover any
  truncated card body to read the full string.

## Admin (Alex)

Sign-in path: `/signin` → My day → `/admin/*`.

Round-9 changes:
- /admin/users/[id] districts checkbox raw token fix (R9 §1A).
- /admin/audit "Failed sign-ins" Quick filter chip (R9 §1E).
- /admin/devices pagination + filter (R9 §2C) — was 255 rows
  with no controls; now 50/page + searchable.
- /admin/audit StaffSchedule kind humanise (R9 §3C codemod).
- parts.ts + statuses.ts gain audit rows on every mutation
  (R9 §3D).

## Manager (Maria)

Sign-in path: `/signin` → My day → `/dashboards/*`.

Round-9 changes:
- /dashboards/finance celebration emoji removed (R9 §2A).

## Warehouse (Wendy)

Sign-in path: `/signin` → My day → `/scan`.

Round-9 changes:
- /scan manual entry fallback (R9 §1B) — USB barcode scanners
  and cameras-denied machines work now.
- Notifications bell empty state (R9 §2I) — no "0" badge when
  inbox is clean.

## Read-only (Ray)

Sign-in path: `/signin` → My day → most routes.

Round-9 changes:
- Read-only role expansion structural test (R9 §3E) — every
  (app) page is gated by `requireSession` / `requireRole` or
  redirects / `notFound()`s. No silent bypass.

## Operator-of-people (Pat — Ops Manager)

Sign-in path: `/signin` → My day → `/scheduling/people`.

Round-9 changes:
- HH:MM digest hour (R9 §1C) on /me/preferences.
- Auto-refresh label clarity (R9 §2G) on /tickets/kanban,
  /dashboards.

## Cross-cutting

- Round-8 regression suite (R9 §0) — 27 structural assertions
  guard against any Round-8 leaf regressing.
- Audit-row coverage extension test (R9 §3D) — every server
  action that mutates DB writes an audit row or delegates to a
  library function that does.
- Notification dispatch audit test (R9 §3F) — every
  dispatchEmailEvent call writes both an EmailLog row and a
  main-audit-log row.
