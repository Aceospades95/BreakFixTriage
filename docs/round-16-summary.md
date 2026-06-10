# Round-16 summary

Theme: operational completeness — the app now notices its own
failures, nags about them, and gives the operator the lever to fix
them in place. Plus the tenant-scoping debt the R13 security pass
left on the table.

## Shipped

- **D2 — exceptions topbar badge.** Admins see an amber count in
  the header chrome whenever any monitored failure mode is non-
  clear; clicking lands on /admin/exceptions. The count comes from
  `src/lib/exceptions/counts.ts`, now the single source for both
  the badge endpoint (`/api/exceptions/count`, USERS_MANAGE-gated
  401) and the page itself — the two can't disagree. Refreshes
  every 5 minutes client-side; renders nothing when clear.
- **D4 — dead-letter requeue.** Dead-lettered EmailJob rows render
  on /admin/exceptions with a per-job Requeue button:
  `requeueDeadLetteredEmailJobAction` resets attempts/backoff,
  returns the linked EmailLog row to `queued`, writes an
  `email.job.requeued` audit row. EMAIL_WRITE-gated.
- **D3 — the missing senders.** The `sla_breach_warning` /
  `sla_breached` templates existed since Round 2 but nothing ever
  dispatched them — the escalation sweep only wrote in-app rows.
  It now fires the matching event through the chokepoint per
  escalated ticket (post-transaction, builder variables +
  `status.label`/`slaThreshold`/`daysInState`), reported as
  `emailsDispatched`. The daily digest routes through
  `dispatchEmailEvent("daily_digest")` whenever an enabled rule
  exists, falling back to the legacy settings-recipients path so
  existing deployments keep working. Also fixed another B19 cuid
  link (escalation notifications now link `/tickets/<INC#>`).
- **D1 — true-SMTP verification.** New
  `tests/integration/smtp-mailpit.test.ts`: dispatch → queue →
  worker → real nodemailer handshake → Mailpit search API shows
  the rendered subject. Verified against a live local Mailpit
  before shipping; in CI it exercises the Mailpit container that
  had sat unused since Round 11. Skips cleanly without SMTP_HOST.
- **D5 — axe beyond the chrome.** The sweep now covers the
  anonymous school portal (token minted per-run, sha256 parity
  with `lib/portal/tokens.ts`) and both print sheets — 4 more
  cases, zero violations, allowlist still empty.
- **B17 (tractable half) — tenant scoping.** Converted per ADR
  0014: `/api/exports/{tickets,invoices,quotes,devices,schools}`
  and every `/bench` query (both scopes) now apply
  `*WhereForSession`. Prerequisite fixed in the same commit:
  seed-test never linked personas to the test district, so scoped
  queries would have blanked the app for every non-admin persona —
  `districtUser.createMany` now links all seven.
  **Dashboards deliberately not converted**: they read through the
  shared `lib/reports/*` helper layer (used by /my-day too);
  scoping them properly means threading the session through that
  layer — filed as R17 work rather than half-done here.
- **B5/B6 closed as already-shipped.** The R12-deferred "device-
  models / parts CSV import UI" has existed for rounds:
  IMPORT_TYPES on /imports/new includes both, with template
  downloads and pipeline wiring. The backlog entries were stale.

## Pins

`tests/round-16/source-pins.test.ts` (13 cases): every B17
conversion keeps its scope call, seed links exist, badge mounted +
shared counts module, sweep dispatches both SLA events, digest
goes through the chokepoint, requeue action gated + audited +
rendered.

## Gates (final)

- tsc / forbidden-tokens — clean.
- Vitest — 915 passing.
- Integration — 25 passing including live SMTP→Mailpit; zero
  skipped with the full env.
- Playwright — 171 passing at CI parity (fresh DB), allowlist
  still empty.
- next build — clean.
