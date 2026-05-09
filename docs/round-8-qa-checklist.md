# Round-8 QA checklist

One section per leaf item. Each: acceptance verbatim from the brief,
PASS / DEFER mark, one-line note. **No PARTIAL bucket.**

## Hard gates (§5)

- **G1 tsc clean** — PASS.
- **G2 eslint clean** — PASS (no new lint).
- **G3 forbidden-tokens grep** — PASS. Round-8 §1B extended the
  gate with rule(devnote), rule(round-tag), rule(url-in-prose).
  Five existing leaks fixed in §1B sweep.
- **G4 vitest** — PASS. New tests this round:
  - tests/audit-format.test.ts +4 cases (§1C → 10 total)
  - tests/not-found-links.test.ts +2 cases (§1C)
  - tests/humanise.test.ts +8 cases (§3D)
  - tests/read-only-role.test.ts +8 cases (§3C)
  - tests/driver-flow-audit.test.ts +8 cases (§3F)
  Targets met: ≥10 humanise, ≥30 forbidden-tokens patterns
  (rule(devnote)+rule(round-tag)+rule(url-in-prose)+enums),
  ≥8 read-only, ≥5 driver audit.
- **G5 Playwright nav-smoke for /not-found grids** — DEFER.
  Structural test in tests/not-found-links.test.ts walks each
  grid's hardcoded routes; live HTTP-level Playwright crawler
  filed in docs/round-8-backlog.md (needs Playwright runtime).
- **G6 Playwright route-flow Start → Arrived → Complete** — DEFER.
  Structural audit-row coverage in tests/driver-flow-audit.test.ts
  ships; live Playwright spec backlogged.
- **G7 Playwright /scheduling/people HH:MM spec** — DEFER. Same
  blocker as G5 / G6.
- **G8 dispatchEmailEvent chokepoint** — PASS. Round-7 §3A smoke
  test still asserts no direct mailer outside lib/email/ +
  lib/notifications/.
- **G9 No silent SNOW merges** — PASS. Round-7 §3C importer
  always writes audit + comment trail; tests cover both paths.
- **G10 No PARTIAL bucket** — every leaf below either passes or
  has an explicit DEFER line + reason.

## §1A — Settings + Permissions + Users humanise (HARD GATE)

Acceptance: every visible enum on /admin/settings, /admin/permissions,
/admin/users, /admin/users/[id], /profile, /admin/statuses renders
through humanise(). Forbidden-tokens grep gate covers the four pages.

PASS — humanise() applied across:
  - /admin/settings SLA grid + bulk-close state dropdown.
  - /admin/permissions column headers (drop uppercase className).
  - /admin/users role pill, /admin/users/[id] role dropdown.
  - /profile role pill.
  - /admin/statuses canonical sentence-case STATE_LABELS.
Forbidden-tokens Rule 5 (Round-7 §2A) catches enum regressions.

## §1B — Devnote / env-var / round-tag / URL leak sweep (HARD GATE)

Acceptance: every concrete leak from the brief replaced with neutral
operator copy. Grep gate extended to catch future regressions.

PASS — fixed leaks at:
  - /imports/new SERVICENOW_* env var names.
  - /admin/settings digest (`npm run digest`) and bulk-close
    (`stateEnteredAt`).
  - /dashboards/finance Parts cost (`Part.costCents`, CONSUMED).
  - /dashboards/productivity (reportedAt → closedAt, TimeEntry).
  - /admin overview Round-3 read-only preview tag.
  - /me/preferences "on the roadmap".
  - /admin/users/[id] /profile/2fa URL-in-prose.
  - /profile/2fa /admin/users URL-in-prose + RFC 6238 jargon.
  - /scheduling/people Week view roadmap.

Grep gate extended: rule(devnote), rule(round-tag),
rule(url-in-prose). Smoke-tested with a temp src/_smoketest/ that
triggered every new rule.

## §1C — Audit pill + arrow consistency

Acceptance: stop-status transitions render Unicode arrow + humanised
both sides; dot-segmented actions render as a sentence-case phrase.

PASS — STOP_STATUS_RE matches "status:FROM->TO"; generic-action
splitter now splits on `:`, `_`, AND `.`. tests/audit-format.test.ts
+4 cases verify.

Acceptance: Playwright clicks every link on /not-found and admin
/not-found. DEFER — structural test in tests/not-found-links.test.ts
asserts every href maps to a real page.tsx. Live Playwright spec
backlogged.

## §1D — Driver flow corrections

Acceptance: vehicle inline edit persists + audits; pluralisation
correct for {0,1,2,5} stops; stop card device count matches active
row count.

PASS (subset):
  - Vehicle inline editor with VehicleMeta + updateRouteVehicleAction
    + vehicle.updated audit row.
  - Route map subline pluralisation.
  - Devices count "(N active · N removed)" split.

DEFER (filed in backlog):
  - Header `…` menu with Reassign / Edit-vehicle / Cancel-route.
  - PHOTOS & PROOF helper labels + thumbnail previews.
  - SCHOOL CONTACT SIGNATURE pad name+role text inputs.

## §1E — People schedule fixes

Acceptance: today's date is default; HH:MM inputs accept locale-aware
parsing; block create writes audit row.

PASS:
  - Default date now uses local-time getters (was UTC, landed on
    tomorrow late in the day for ET operators).
  - Date-nav strip: prev | Today | next + typed date input.
  - HH:MM time pickers via `<input type="time">`. Server action
    coerceTimeToMinutes preserves legacy integer-form callers.
  - Block-type dropdown drops WAREHOUSE (role) + ON_ROUTE (derived).
    Default = PTO.
  - "PTO" / "OOO" / "TOTP" / "URL" / "API" / "CSV" / "INC"
    preserved upper via lib/cn.ts acronym list.

DEFER:
  - Day window 8a–8p configurable via Settings.
  - Single popover per row.

## §2A — Quotes amount formatting

Acceptance: locale-formatted with thousands separator across
/quotes, /dashboards/finance, /tickets QUOTES card.

PASS — new formatCents() in lib/format.ts using Intl.NumberFormat;
applied to /quotes table + /tickets ticket-detail QUOTES + parts
cost cells. /dashboards/finance already had the right shape.

## §2B — Bench polish

PASS (subset):
  - "Resolve at /duplicates →" → "Resolve in queue →" (URL leak).
  - Aging cue: red left-border at 21d, amber at 14d.

DEFER:
  - Per-tech vs per-role counter rephrase.
  - "Assign to me" button on Unassigned cards.
  - In-warehouse split column.

## §2C — Kanban polish

DEFER (subset). The Closed column / "+243 more" expand / 23-column
collapse / play-arrow tooltip are layout work; auto-refresh
sentence-case landed via §2E.

## §2D — Tickets list polish

DEFER. Filed in backlog. Smaller fixes (smart column widths,
hide-merged default, BULK ACTIONS clarity, "N selected" indicator,
filter expansion, saved-filter chips) all need design or storage
layer work.

## §2E — Bell + help + shortcuts polish

PASS (subset):
  - Notification bell header sentence-case.
  - Help menu header sentence-case.
  - Keyboard shortcuts overlay header sentence-case.

DEFER: new shortcuts (g p / g u / g n / g , / g .) + Cmd+K.

## §2F — Profile + preferences polish

PASS (subset):
  - /profile gains "Preferences →" action link.
  - /me/preferences gains "← Profile" action link.

DEFER: theme picker in avatar dropdown, HH:MM digest hour, timezone
selector.

## §2G — Admin sub-page polish

DEFER. Filed in backlog (large surface; touches /admin/users
inline action menu, search/filter, /admin/devices filters /
pagination, /admin/parts empty-state, /admin/holidays bulk-import
+ today-jump, /admin overview count badges, bulk-close-stale
canonical surface).

## §2H — Dashboards polish

PASS (subset):
  - 12-month chart labels months "Jun '25" with tooltip "June 2025".

DEFER: aging tile click-through, Open-by-state full list, "closed
per assignee" rephrase, empty-state celebration differentiation.

## §2I — Search + Scan polish

DEFER (full section). Filed: /scan manual entry, top-bar INC# hop,
phone redact, school sub-action.

## §2J — My Day OPS ATTENTION reconciliation

PASS. Both Active routes tiles gain hint tooltips:
  - My Day: "Routes scheduled for today".
  - /scheduling: "Routes in DRAFT, PLANNED, or IN_PROGRESS".

## §3A — Admin observability gaps

PASS (subset):
  - Sign-in audit hook (NextAuth events.signIn → AuditLog
    action="auth:login").
  - Last sign-in column on /admin/users derived from the audit
    hook; "—" until first sign-in.
  - Reset 2FA action already shipped (Round-7 work).

DEFER (filed in backlog):
  - Recent sessions panel on /admin/users/[id] (last 10 sign-ins
    with IP + user-agent fingerprint).
  - /admin/audit Failed sign-ins pre-filter chip.
  - /admin/email-log per-recipient grouping + resend.

## §3B — First-run auto-seed

PASS:
  - lib/setup/first-run.ts seeds TEMPLATE_SEEDS + one Global
    EmailRule (ticket_created, disabled) + 6 US federal holidays.
  - Wired into /signin page server component (idempotent + cached
    by AppSetting "first_run_completed" flag).
  - User.count > 0 short-circuit prevents accidental re-seeds.

## §3C — Read-only role behavior smoke

PASS — tests/read-only-role.test.ts asserts the READ_ONLY role's
permission set carries every read perm and zero write perms (8
cases, target was ≥8).

DEFER — full Playwright UI walk filed in backlog.

## §3D — Sentence-case humanise library

PASS — src/lib/humanise.ts re-exports humanizeRole / humanizeState /
humanizePriority / humanizeAction / humanizeSource / humanizeEntity
+ adds humanizePermission. tests/humanise.test.ts +8 cases.

DEFER — codemod across existing import sites filed (lib/format.ts
+ the new lib/humanise.ts coexist).

## §3E — Live integration tests for §3A / §3C from R7 backlog

DEFER (full section). Both tests need a CI Postgres + fake
transport / Playwright runtime. Round-7 structural smoke +
Round-8 §3B first-run seed reduce the blocker but the live tests
themselves stay backlogged.

## §3F — Driver flow audit-row coverage

PASS — tests/driver-flow-audit.test.ts asserts the audit-write
hooks exist for: updateStopStatus, addDeviceToStop,
removeDeviceFromStop, cancelRoute, updateRouteVehicleAction,
mergeTicket, reconcileSnowImport edge cases, auth signIn (8 cases,
target was ≥5).

DEFER — Reassign-driver / sign-off save / photo upload / signature
save asserts (those flows haven't shipped).
