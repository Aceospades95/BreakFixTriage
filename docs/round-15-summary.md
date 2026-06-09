# Round-15 summary

Theme: close every remaining test gap, then make the app earn
trust in the places operators don't look. Three headline items:
the email system was mostly dead and nobody could tell; the test
suite now has **zero disabled specs anywhere**; and the app passes
a real per-element WCAG AA sweep in both themes.

## The email finding (critical)

Six of nine `dispatchEmailEvent` call sites passed flat ids
(`{ ticketId, quoteId, … }`) while every seeded template requires
the nested `{ ticket: { number, school, … }, link }` shape. Those
sends failed template validation on every trigger and dead-lettered
into EmailLog as `failed` rows — the notification system *looked*
wired but transition emails, assignment emails, quote emails,
delivery-scheduled, and pickup-completed could **never deliver**.
The three call sites that did build the shape used relative
`/tickets/<cuid>` links — dead inside a mail client (B19).

Fix: `src/lib/email/variables.ts` is now the single source of the
ticket-family variable shape (absolute incident-number links built
from NEXTAUTH_URL); all seven call sites route through it with
per-event extras. Pinned twice:

- `tests/round-15/email-variable-contract.test.ts` — for every
  ticket-family template, builder shape + call-site extras satisfy
  the template's `required` keys (15 cases). Adding a required key
  without updating the call site fails here, not in production.
- Integration: the transition path (`notifyOnEnter` →
  `status_in_repair`) now has an end-to-end test that walks rule →
  render → queue → worker → provider and asserts the rendered
  subject was delivered.

## B12 closed — zero disabled tests remain

The in-memory email provider (`EMAIL_PROVIDER=memory`, B12 option
b) replaces the Mailpit dependency for assertion purposes:

- `tests/integration/dispatch-email-event.test.ts` — the 4 stubs
  are now 5 real tests (EmailLog row, recipients, worker delivery
  with rendered subject, disabled-rule no-op, transition path).
- `e2e/notification-dispatch.spec.ts` — the last `test.fixme` in
  the repo is active: quick-create a ticket via the UI → assert
  the dispatch row on /admin/email-log (+ optional Mailpit probe
  in CI). Required fixtures (TicketTemplate, SPOC contact, enabled
  ticket_created rule) ship in seed-test with the `system_seed`
  audit rows the idempotency invariant demands.
- B19 bonus: quick-create now redirects to `/tickets/<INC#>`
  instead of the cuid.

## B9 closed — axe-core WCAG 2.1 A/AA sweep

`e2e/axe-sweep.spec.ts` walks 12 pages × 2 themes with
`@axe-core/playwright` and asserts **zero violations** (empty
allowlist). Real defects found and fixed:

- `--color-muted-foreground` (light) measured 4.04:1 on the page
  surface — below the AA floor its own comment claimed. Darkened
  to #5c6c5c (≥5.0:1 on both light surfaces).
- The light-mode remap mapped `text-slate-500` to itself (4.32:1)
  and `slate-600` to 4.39:1; dark mode had no slate remap at all
  (slate-500 on cards: 3.05:1). Both tiers now remap per theme —
  one CSS change fixed ~170 usages per theme.
- Light remaps added for `orange-100/200`, `violet-100`,
  `teal-100/200`, `sky-100/200`, `indigo-100`, `emerald-300`
  (SLA badges, schedule-kind chips, enrollment labels).
- Unlabeled controls: profile password fields (label/id pairing),
  bulk-select checkboxes (`aria-label` per incident), quick-create
  selects, schedule date input.
- In-prose links rely on underline, not color alone
  (`link-in-text-block`).

## B26 — /admin/exceptions

New failure-mode rollup, linked at the top of the admin sidebar.
Six sections, each a count + recent offenders + a deep link to the
fixing surface: failed email dispatches (+ dead-lettered jobs),
synthetic-merge conflicts, orphaned stop devices, stuck imports
(>1h in a non-terminal status), portal tokens expiring within 30
days (expired in red), and high-severity audit events (7 days).
Sections render "Clear." when empty so the page doubles as a list
of what's monitored.

## B11 — /people directory

Graduated from the Round-13 redirect to a real staff directory:
every active user with role, open-ticket count (linking to the
filtered ticket list), and per-person links to the schedule grid,
their assigned tickets, and (admins) the user record. The two R13
structural pins that asserted the redirect were updated to pin the
graduated contract.

## C1 — seed name collision

Dev-seed personas renamed (Avery/Omar/Dev/Willa/Theo/Dora/Rita) so
a DB seeded with both `db:seed` and `db:seed:test` no longer shows
two identical "Tess Technician" rows on people surfaces.

## Infra

- `docker-publish.yml` had the same dead-trigger bug ci.yml had:
  pushes to `Main-BreakFix` never built, so after the Round-14
  `latest` gate the production tag could never republish. Fixed;
  the first post-merge push to the default branch heals `latest`.
  (workflow_dispatch is not available to the app token — 403.)

## Gates (final)

- tsc / ESLint / forbidden-tokens — clean.
- Vitest — 902 passing (was 853): +15 email-contract, +28
  admin-gate pins landed in R14's tail, + assorted.
- Integration — 24 passing, 1 cross-reference comment, **zero
  Mailpit-gated skips**.
- Playwright — 167 tests (142 previous + 24 axe + notification
  dispatch), all passing, **zero fixme**.
- next build — clean.
