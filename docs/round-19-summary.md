# Round-19 summary

Theme: the deepest review yet — every server action, API route,
navigation target, and interactive element audited; every daily-work
mutation exercised live through the UI. Four systematic audits
(actions, APIs, navigation, buttons/forms) plus a new
`e2e/deep-functional.spec.ts` suite that drives the flows the smoke
tests only ever loaded.

## Audit coverage

- **28/28 server action files**: every action gates on
  requireRole/requireSession; every action validates with Zod. No
  security gaps. Email-dispatch failures inside actions are caught
  and logged BY DESIGN (the operation must not fail because a
  notification couldn't send) — they surface via the email log and
  the exceptions dashboard, not the operator's redirect.
- **18/18 API routes**: auth + tenant scoping verified (ADR 0014).
  One real hole found and fixed (below). CSV exports all return
  proper text/csv + status codes.
- **150+ navigation targets**: sidebar, admin sidebar, command
  palette (35 entries), server redirects, dynamic href builders —
  all cross-checked against the real route tree. Five dead links
  found and fixed (below).
- **Every interactive element**: no orphaned submit buttons, no
  dead modals, no empty handlers, no TODO copy rendered to users,
  feedback banners/ToastHost wired on every mutation surface.

## Fixed this round

1. **Tenant scoping on the scan resolver** (security).
   `/api/scan` resolved tickets/devices/schools with NO district
   filter — any authenticated user could enumerate cross-tenant
   entities by guessing serials/INC numbers. `resolveScan` now
   takes the session and composes the `*WhereForSession` filters
   (parts stay global — no district on inventory). Admin and
   internal callers stay unscoped. Unit-tested with a capture mock.
2. **Global-search dead links** (404s in daily use).
   Non-admin school hits pointed at `/schools/<id>` and device hits
   at `/devices/<id>` — pages that never existed. Contact hits
   pointed at `/admin/contacts`, which also never existed, for
   EVERYONE including admins. Non-admins now land on the tickets
   list filtered to the school/serial; admins land on
   `/admin/schools/<id>` for contacts.
3. **Audit-log chip dead links.** EmailRule chips linked
   `/admin/email-rules/<id>/edit` and District chips
   `/admin/districts/<id>` — neither page exists. Both now link
   their list pages.
4. **Photo save button** explains itself (`title`) when disabled by
   the 25 MB limit.

Verified-clean (no change needed): RMA actions already revalidate
before redirect; the remaining `?error=` string-concats in
scheduling.ts are all on static paths that cannot carry a prior
query string; `/api/imports/templates` sits behind the auth
middleware.

## New live coverage — e2e/deep-functional.spec.ts (9 tests)

- §A ticket workbench: post comment, start/stop timer, transition
  AWAITING_PICKUP→ON_HOLD→back via the transitions card, next-action
  banner tracks state.
- §B quote lifecycle: create draft → send (ticket follows to
  QUOTE_SENT) → mark approved (ticket follows to QUOTE_APPROVED).
- §C RMA: create an RMA record on a MANUFACTURER_RMA ticket.
- §D admin CRUD: create a school with address (lands on detail
  page); create + confirm-delete a holiday.
- §E: notifications mark-all-read; all 8 CSV exports return
  text/csv 200; CSV import round-trips the generated template into
  a batch page; scan resolves a fixture serial through the UI and
  the API stays scoped for district members.

## Gates (all green at HEAD)

tsc ✓ · build ✓ · vitest 918 ✓ (3 new scan-scoping tests) ·
Playwright 187 ✓ · forbidden-tokens ✓

## Known testing limitations

- Kanban drag-and-drop is not simulated (the underlying transition
  API is covered and auth/422 paths audited).
- ServiceNow API sync needs live credentials — file-upload import
  path is covered instead.
- 2FA TOTP enrolment needs an authenticator loop; reset/disable
  paths are covered by the round-13 specs.
