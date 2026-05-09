# Round-8 personas

The Round-8 audit walked the app from each operator persona's
perspective. Findings consolidated into §1 / §2 / §3 in the brief;
this doc captures the *persona* shape of each finding so future
rounds can re-walk efficiently.

## Driver (Dante)

Sign-in path: `/signin` → My day → `/scheduling/routes/{id}`.

Top friction:
- VEHICLE field showed "—" with no editor (§1D — shipped).
- Stop card device count mixed active + removed (§1D — shipped).
- Route map subline "1 stops" plural bug (§1D — shipped).
- No vehicle / driver swap header menu (§1D — partial; backlog).
- Photo helpers + signature pad name+role inputs (§1D — backlog).

## Repair tech (Trish)

Sign-in path: `/signin` → My day → `/bench`.

Top friction:
- Bench card INC numbers wrapped at 320px lane width (Round-7 §1C).
- Aging tickets blended in (no urgency cue) — §2B left-border
  glow at 14d / 21d (shipped).
- Bench Unlinked lane "Resolve at /duplicates →" leaked URL —
  §2B "Resolve in queue →" (shipped).
- Per-tech lanes only verifiable with real assignee data (backlog).

## Admin (Alex)

Sign-in path: `/signin` → My day → `/admin/*`.

Top friction:
- /admin/settings SLA grid showed every TicketState raw enum
  (§1A — shipped).
- /admin/permissions column headers + slugs leaked (§1A — shipped).
- /admin/users role pill, /admin/users/[id] role dropdown all raw
  (§1A — shipped).
- /imports/new ServiceNow env var names visible (§1B — shipped).
- /admin/settings digest hint leaked `npm run digest` (§1B —
  shipped).
- Several round identifiers in copy ("Round-3 read-only preview",
  etc.) (§1B — shipped).
- Last sign-in column missing on /admin/users (§3A — shipped).
- Recent sessions panel + failed sign-in filter chip + email-log
  resend (§3A — backlog).

## Manager (Maria)

Sign-in path: `/signin` → My day → `/dashboards/*`.

Top friction:
- Dashboards 12-month chart labelled months "06" (§2H — shipped:
  "Jun '25" + tooltip).
- Active routes counter mismatch between My day and /scheduling
  (§2J — shipped tooltips).
- Aging > 30d tile not click-through (backlog).
- Productivity / Finance prose copy + last-refreshed indicator
  (Round-6 backlog).

## Warehouse (Wendy)

Sign-in path: `/signin` → My day → `/scan`.

Top friction:
- /scan no manual-entry fallback for USB scanner workflows (backlog).
- Top-bar search lacked direct INC# hop (backlog).
- Search dropdown leaked phone numbers to non-admin (backlog).

## Read-only (Ray)

Sign-in path: `/signin` → My day → most routes.

Top friction:
- No structured test that write affordances are hidden / disabled
  (§3C — shipped structural assertion; Playwright backlog).
- Save buttons greyed across /admin/* — verified via permission
  set assertions (§3C — shipped).

## Operator-of-people (Pat — Ops Manager)

Sign-in path: `/signin` → My day → `/scheduling/people`.

Top friction:
- Page defaulted to TOMORROW not TODAY (§1E — shipped).
- Time inputs were integer minutes-since-midnight (§1E — shipped
  HH:MM pickers).
- Block-type dropdown included "Warehouse" (a role) (§1E — shipped).
- "PTO" rendered as "Pto" (§1E — shipped acronym list).
- No date picker / Today button (§1E — shipped).
- Day window 8a–5p only (Round-9 backlog — needs Settings keys).
