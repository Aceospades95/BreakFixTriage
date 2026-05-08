# Round-12 backlog — carried forward + new

## Inherited from Round-11

These were filed in `docs/round-11-backlog.md`. R12 status:

### Graduated in R12

- ✅ Playwright runtime in CI → R12 §1E
- ✅ CSV importers — *still deferred*; the kebabs gained more
  actions but full importer pipelines for schools/devices/
  device-models/parts remain a multi-section workstream
- ✅ In-memory email transport branch → still open (not blocking)
- ✅ Cmd+K user-name fuzzy match → still deferred (privacy API)

### Still open from R11

- **In-memory email transport branch** in `src/lib/email/send.ts`
  for fast integration tests. Mailpit works; in-memory would be
  faster.
- **Cmd+K user-name fuzzy match** — needs privacy-aware API.
- **Multi-tenant district scoping at the DB layer** — Postgres
  RLS via Prisma access-policy middleware.
- **`/forbidden` route** — currently the read-only role hitting
  a forbidden route gets `?error=` on the home page. A dedicated
  /forbidden landing pad would render a clearer message.

## New in R12 (deferred to R13)

### Polish §2 deferrals

The §1 and §3 work consumed the round budget. The polish
deferrals below are documented for R13 entrypoint:

- **§2B /admin/holidays year stepper highlight** — current year's
  pill should use `bg-emerald-500/20 text-emerald-400 ring-emerald-500/40`
  treatment + add a "Today" link when looking at a non-current
  year. CSS-only; small but unscoped this round.
- **§2D /tickets/[id] inline editor save toast** — the
  PRIORITY / ASSIGNEE / INVOICE REQUIRED selects need a 2-second
  toast confirmation post-save + spinner during the optimistic
  write + error toast on failure. Needs a client component
  wrapper around the existing form-level save links.
- **§2E /tickets/[id] CHANGE STATUS (ADMIN) safety gate** —
  add (a) confirmation dialog showing current → target state +
  5-second countdown before button is clickable, (b) require
  reason ≥10 chars, (c) write audit with `severity: 'warn'`.
  Substantial — needs new ConfirmGuard client component +
  schema column for severity.
- **§2F /tickets/[id] AVAILABLE TRANSITIONS UX** —
  (a) clarify which transitions require a reason vs are
  optional + matching placeholder, (b) smooth-scroll-to-top
  after a successful transition apply. Per-transition metadata
  needs to live in `src/lib/workflow/transitions.ts`.
- **§2H /tickets/[id] Email SPOC modal preview** — currently the
  button is wired to a server action but the brief asked for a
  modal preview showing recipient list + subject + rendered
  body + Send/Cancel. Substantial: needs new modal component +
  EmailTemplate render endpoint + Mailpit fixture for the live
  spec.

### Hardening §3 deferrals

- **§3A persona Playwright deep assertions** — R11 stubbed the
  7 spec files, R12 wired the runtime. The brief asks for
  detailed daily-workflow assertions per persona (driver clicks
  Start, tech clicks Pick up, dispatcher reorders stops, etc.).
  R12 has the stubs working. Each spec needs deeper interaction
  to graduate from "lands the route" to "exercises the workflow".
- **CSV importers for schools / devices / device-models / parts**
  — still deferred. Each needs upload form + Papa-parse + dedupe
  + audit per row + import-history page.
- **Audit string format normalization** — R11 §1C renamed
  `user.sessions_revoked` → `user.sessions.revoke_all`. R12 §1D
  was asked to rename `2fa:admin-reset` → `admin_reset_2fa`. The
  rename is non-trivial because it orphans historical audit rows
  in production. Filed for a future round + migration that
  rewrites historical rows.

## Round-3 carry-forwards (still open)

- **/admin/audit retention policy + auto-purge** — configurable
  in /admin/settings.
- **SSO / SAML / OIDC integration** — Google OIDC works; full
  SAML / OIDC providers don't.
- **Mobile-responsive layouts for /scan, /bench, /tickets/[id]**.
- **Real-time websocket for /tickets/kanban** — currently 30s
  poll.
- **PDF export for work orders + quotes** — print-only today.
- **Bulk import for StaffSchedule blocks** — one-at-a-time today.
- **Mapbox real-tile rendering** — still SVG fallback.
- **Reset role defaults UI on /admin/permissions**.

## Choice-point deferrals

These are the (a) vs (b) decisions called out in the brief:

- **Sessions panel display strategy** — chose (a) privacy-by-
  design: hash IP + UA, label as Session id / Device fingerprint,
  drop the `ip:` / `ua:` prefixes on display. Operators who
  need real IP/UA values for security forensics can grab them
  from the underlying access logs at the load balancer / CDN
  layer. If the security policy ever flips to (b) "store + render
  real values", retire the hash fields and ship a privacy review.

## Round-13 entrypoints

The biggest deferred items that should headline R13:

1. **Polish §2B / §2D / §2E / §2F / §2H** — each is small in
   scope but needs a dedicated workstream because each touches
   client-side React + matching tests.
2. **Persona Playwright deep assertions** — R12 has the runtime,
   R13 fills in the workflow steps.
3. **CSV importers** — schools / devices / device-models / parts.
4. **Mobile-responsive layouts** — /scan, /bench, /tickets/[id].
5. **Real-time kanban** — replace the 30s poll with websockets.
