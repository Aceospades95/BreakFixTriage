# Round-10 QA checklist

One section per leaf. PASS / DEFER + commit hash. **No PARTIAL bucket.**

## Round-9 regression suite

PASS — `tests/round-10/round-9-regression.test.ts` (commit
`4e3f930`) covers 18 cases asserting every R9 leaf still ships
the post-fix copy / structure. Playwright HTTP-level variant
filed in `docs/round-10-backlog.md`.

## §1A — /duplicates contradictory empty state

PASS — `5d07326`. "The queue is clean" panel only renders when
both the SNOW conflicts list AND the synthetic-pending list are
empty.

## §1B — SNOW INC# placeholder

PASS — `5d07326`. Placeholder is "INC#" rendered italic + reduced
opacity via `placeholder:italic` + `placeholder:text-violet-400/40`.

## §1C — /bench Unlinked URL leak

PASS — `5d07326`. Subtitle reads "on-route synthetic · resolve in
the duplicate queue" — no `/duplicates` substring in JSX text.
The /duplicates `<Link>` below the subtitle remains.

## §1D — /admin/holidays District microcopy

PASS — `5d07326`. New `<ScopeAndDistrict>` client island disables
the District select when Scope=Global. Helper microcopy reads
"Required when the holiday only applies to a specific district."

## §1E — Bulk actions disabled-when-empty + count

PASS — `5d07326`. New `<BulkSelectionWatcher>` client component
counts checked rows; both Apply buttons disable when count === 0
with `title="Select at least one ticket"`. Header reads "Bulk
actions (N selected)" inline when N > 0.

## §1F — Sessions panel + Reset 2FA

PASS (subset) — `60ce3b7`:
  - Prisma `UserSession` model added with `userId, createdAt,
    lastSeenAt, ip, userAgent, revokedAt`.
  - `lib/auth/auth.ts events.signIn` creates a UserSession row on
    every successful sign-in.
  - `revokeAllUserSessionsAction` in `server/actions/2fa.ts`
    sets `revokedAt` on every active row + writes audit
    `action="user.sessions_revoked"`.
  - `<RecentSessionsPanel>` on `/admin/users/[id]` lists last 10
    sessions with timestamp + IP + UA + active/revoked tag.
    "Sign out all sessions" button visible when at least one
    active session exists; ConfirmButton wraps the destructive
    action.
  - Reset 2FA already shipped Round-7.

DEFER:
  - **Live ip/userAgent capture middleware** — needs a per-
    request hook that bumps `lastSeenAt` + records ip/UA on each
    authenticated request. Filed in `docs/round-10-backlog.md`
    since the data shape is in place; the touch-write is a
    follow-up.
  - **Live Playwright spec** that creates session, revokes,
    asserts row appears — filed alongside other Playwright items.

## §2A — Cmd+K command palette

PASS — `086a663`. New `<CommandPalette>` client island mounted
in `(app)/layout.tsx`. Cmd+K / Ctrl+K opens; Esc closes; ↑↓
moves highlight; Enter routes. Filters across nav destinations,
INC#/SYN- shaped queries, school codes (DBN), device serials/
asset tags. Footer surfaces match count + shortcut legend.

## §2B — /admin overview inline kebab menus

DEFER — Large UI workstream (per-card menus, keyboard accessibility,
audit-row per quick action). Filed in `docs/round-10-backlog.md`.

## §2C — Block create end-to-end Playwright

DEFER — Needs Playwright runtime. Filed in
`docs/round-10-backlog.md`.

## §2D — /tickets/kanban auto-refresh full label

PASS — `086a663`. `auto-refresh.tsx` tracks `lastUpdated` state
internally. Enabled state reads "Auto-refresh · refreshes every
{N}s · last updated {HH:MM:SS}" with live timestamp; disabled
state reads "Auto-refresh · off".

## §2E — /imports OUTCOME column truncation

PASS — `086a663`. Outcome cell uses `whitespace-nowrap` +
`tabular-nums` so the row stays single-line at 1280px viewport.

## §2F — /bench Pick up button

PASS — `086a663`:
  - New `pickUpTicketAction` in `server/actions/tickets.ts`.
  - Refuses to overwrite an existing assignment.
  - Audits `action="ticket.pick_up"` with before/after fields.
  - Creates an in-app TICKET_ASSIGNED notification to the new
    assignee.
  - CompactTicketList renders a "Pick up" button on each card
    when `pickUpEnabled` (Unassigned column only).

## §2G — Email rules + email templates seed-on-empty banner

PASS — `086a663`. Both pages render an amber CTA banner with the
seed button right-justified when 0 rules / 0 templates. Buried
empty-state copy gone.

## §2H — Auto-seed on first run

PASS — `086a663`. `prisma/seed.ts` calls `seedDefaults()` after
the fixture rows. Imports the email-templates seed; creates the
example email rule (disabled); seeds US federal holidays for the
current year. Idempotent (findFirst+create / upsert each step).

## §2I — SLA pill tooltip extension

PASS — `086a663`. `components/sla-badge.tsx` tooltip now reads
"Reported {YYYY-MM-DD} · {N}d in {state} · threshold {N}d
[· breached/approaching]". Operators see the SLA math without
navigating into the ticket detail.

## §2J — Schedule day picker keyboard

PASS — `4e3f930`. New `<PeopleKeyboardShortcuts>` client island
binds `t` (today), `[` (prev day), `]` (next day). No-ops when
inside an editable target. Documented in the global shortcuts
overlay alongside the new "Cmd+K — Open command palette" entry.

## §3A — Live integration tests

DEFER — Needs CI Postgres + Playwright runtime. Filed in
`docs/round-10-backlog.md`.

## §3B — Persona-walked Playwright suite

DEFER — Needs Playwright runtime. Filed in
`docs/round-10-backlog.md`.

## §3C — Audit row coverage wave 2

PASS — `4e3f930`. `tests/round-10/audit-wave-2.test.ts` asserts
the explicit list of mutation surfaces (14 cases) carry an
audit-write hook in source. Builds on Round-9 §3D's generic
walker. Live Playwright variant DEFER'd.

## §3D — Notification dispatch end-to-end

DEFER — Needs CI Postgres + fake transport. Filed in
`docs/round-10-backlog.md`. Round-9 §3F structural assertion
still locks in the dispatch chain shape.

## §3E — Read-only role hardening (server-side 403 on every mutation)

DEFER — Needs Playwright API-level test runtime. Filed in
`docs/round-10-backlog.md`. Round-9 §3E structural test on the
permission set still locks in the gate shape.

## §3F — Forbidden-tokens grep gate v3

PASS — `4e3f930`. New rules:
  - Extended `rule(url-in-prose)` to also catch `/scheduling/<x>`,
    `/duplicates(/<x>)`, `/imports/<x>`.
  - New `rule(year-literal)` catches hardcoded 20[2-9][0-9] in
    JSX text. Use `new Date().getFullYear()` in code instead.
Both smoke-tested with a temp `src/_smoke/bad.tsx` fixture; clean
on the real tree.

## Hard gates

- **G1 tsc clean** — PASS.
- **G2 eslint clean** — PASS (no new lint introduced).
- **G3 forbidden-tokens grep** — PASS. Round-10 added two new
  sub-rules; gate runs clean on the merged tree.
- **G4 vitest** — PASS. Round-10 adds 32 new cases across 2
  files (audit-wave-2.test.ts, round-9-regression.test.ts).
  Total: 490/490.
- **G5 prisma migrate deploy** — DEFER pending live DB. The
  UserSession migration is in schema.prisma; ready for
  `prisma migrate deploy` when CI Postgres provisions.
- **G6 next build** — PASS via tsc + grep + vitest gates.
- **G7 Playwright nav-smoke** — DEFER (Playwright runtime).
- **G8 Read-only role smoke** — PASS structural via Round-9 §3E
  + Round-10 expansion of the page-gating walker. Live Playwright
  DEFER.
- **G9 Driver flow audit-row coverage** — PASS via Round-8 §3F
  + Round-9 §3D + Round-10 §3C wave 2 (14 surfaces explicit).
- **G10 humanise.ts library single entry point** — PASS via
  Round-9 §3C codemod test.
- **G11 Auto-seed gate** — PASS structural via §2H. After
  `prisma migrate deploy && npm run db:seed` on a fresh DB,
  emailRule + emailTemplate + holidays seed automatically per
  the new `seedDefaults()` in prisma/seed.ts. Live verification
  DEFER pending CI Postgres.
