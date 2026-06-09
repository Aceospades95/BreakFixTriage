# Round-15 backlog

Filed during R15 — to ship in R16 or later. B12 (Mailpit/email
fixtures), B9 (axe sweep), B11 (/people), B26 (exceptions), C1
(seed names), and B19's email-link half all graduated this round.

## Carried forward

- **B5 + B6** — admin device-models / parts CSV import UI. The
  pipeline functions (`runDeviceModelImport`, `runPartImport`)
  exist; the upload UI + dedupe review surface don't. Unchanged.
- **B13** — audit string normalisation (`transition:*`, dotted,
  colon-prefixed formats coexist). Needs a sweep + historical-row
  migration; still the right candidate for a dedicated round.
- **B17** — remaining `*ForSession` tenant-scoping conversions
  (CSV exports, /bench, /dashboards/*, /notifications).
- **B20-B31 (R13 security-pass list)** — unchanged where not
  explicitly graduated.

## New in R15

- **D1 — true-SMTP verification in CI.** The memory provider
  closed the assertion gap, but the Mailpit container in the CI
  integration job is still unexercised. Entry point: a CI-only
  variant of `dispatch-email-event.test.ts` that sets
  `EMAIL_PROVIDER=smtp` + `SMTP_HOST` and polls the Mailpit JSON
  API. The notification-dispatch e2e spec already probes Mailpit
  opportunistically when :8025 responds.
- **D2 — exceptions page counts as a topbar badge.** /admin/
  exceptions surfaces the failure modes; an admin still has to
  visit it. Entry point: a small server component in the topbar
  that renders the total-exception count for USERS_MANAGE
  sessions when > 0.
- **D3 — daily_digest + sla_breach senders.** The contract test
  covers their template shapes, but no call site dispatches
  `sla_breach_warning` / `sla_breached` emails yet (the escalation
  script writes audit rows only) and `daily_digest` is cron-only.
  Wire them through `dispatchEmailEvent` with the builder.
- **D4 — exceptions section for dead-lettered EmailJob rows.**
  The count renders; a per-job retry affordance ("re-enqueue")
  needs a server action + audit row.
- **D5 — axe sweep for the portal + print pages.** The 12-page
  sweep covers the operator app; `/portal/[token]` and the print
  sheets render outside the (app) chrome and aren't walked yet.
