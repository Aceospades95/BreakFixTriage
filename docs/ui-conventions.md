# UI conventions

This is the canonical reference for visual and interaction
conventions. Pull-request authors should align to it. Reviewers
should call out drift.

## 1. Toast policy

The app uses one toast primitive: `src/components/toast-host.tsx`.
Server actions communicate success / failure by redirecting with a
`?ok=...` or `?error=...` query string. The toast host reads the
param, pops a fixed-position toast, and strips the param from the
URL via `router.replace` so a refresh doesn't re-toast.

Rules:

- **Every save shows a toast.** Priority change, assignee change,
  invoice-required toggle, description edit, comment post, comment
  delete, transition, force change, settings save, bulk action,
  import commit, route assign, stop status update, scan-in. No
  silent saves.
- **Success toasts** carry the change in plain English, e.g.
  *"Priority changed to HIGH"*, *"Comment posted"*,
  *"Forced INC1000003 to AWAITING_PARTS"*.
- **Error toasts** carry an operator-facing message. **No Prisma
  stack tokens** (`prisma.`, `invocation`, `P20\d\d`) and **no cuids**.
  See §3 (forbidden tokens).
- **Lifecycle:** show 3.5s, fade 0.5s, total visible 4s. Click ✕ to
  dismiss early. The toast host queues multiple toasts vertically.
- **Position:** bottom-center, 1.5rem inset.
- **A11y:** `role="status"` + `aria-live="polite"`. Failures use
  `aria-live="assertive"` (TODO when the audit lands the per-toast
  role split).

Server actions that should toast but currently don't are tracked in
`docs/proposed-issues.md` Q-toast-coverage.

## 2. Pill casing

Status pills, role pills, priority pills, and any other "categorical
small label" use **titlecase** with the first letter capitalised and
spaces between words. Example: "Awaiting parts", "Quote sent",
"Manufacturer RMA" (acronyms remain uppercased), "On hold". Do
**not** ship `ALL_CAPS_SNAKE_CASE` to the user-facing surface — that
is an internal enum representation.

The `StatePill` component is the only place that owns the
state→label conversion. Other surfaces import the helper instead of
re-implementing it.

Convention: a `humaniseEnum(value: string): string` helper lives in
`src/lib/cn.ts` and lower-cases all but the first letter, replaces
underscores with spaces, and special-cases known acronyms (`RMA`,
`SLA`, `OOW`, `PO`, `SN`, `DBN`, `NYC`).

## 3. Forbidden tokens (operator-facing surface)

The following tokens must never appear in any user-facing string:

- `prisma.` — leaks the ORM name.
- `invocation` — Prisma stack signature.
- `P2\d{3}` (any P-code) — Prisma error code.
- `cm[a-z0-9]{20,}` — cuid pattern (raw IDs leak).

Surfaces this applies to: status messages, toast bodies, page text,
table cells, error banners, `?error=` query params (server actions
should translate before redirecting).

A test in `tests/forbidden-tokens.test.ts` runs a static scan over
strings that flow into `redirect(...?error=...)` to catch
regressions.

## 4. Em-dash, en-dash, hyphen

- **Em-dash** `—` (U+2014) for parenthetical asides — this — and
  for "X — Y" titles.
- **En-dash** `–` (U+2013) for numeric ranges (`10–20 days`).
- **Hyphen** `-` for compound words (`break-fix`, `out-of-scope`).

Never use `--` as a stand-in for em-dash.

## 5. Empty-state iconography

Pick one style per view family and stay consistent:

- **List / table empty states** — short sentence with a CTA link, no
  emoji. Example: *"No tickets match the current filters. Try
  clearing them or run an import."*
- **Dashboard / KPI empty states** — emoji is allowed and
  encouraged: 🎉 for "nothing to do", ⏰ for "all caught up".
- **Form empty states** — short descriptive sentence, no emoji.

The findings report flagged that 🎉 appears on Invoices and Device
hotspots but not on Quotes or Duplicates. Fix is to apply the
Dashboard rule to all four (they're all "are there any?" KPI
surfaces) — tracked as a polish item in §5.D of the brief.

## 6. Light / dark coverage matrix

Every component must be checked in both themes. The matrix:

| Component                | Dark | Light | Notes                                                              |
| ------------------------ | ---- | ----- | ------------------------------------------------------------------ |
| Sidebar (incl. icons)    | ✅   | ⚠️    | Light variant under-styled; tracked under D in findings.           |
| Topbar + search          | ✅   | ⚠️    | Search placeholder is white-on-white in light mode. Tracked.       |
| Status pills             | ✅   | ✅    |                                                                    |
| Toast host               | ✅   | ✅    |                                                                    |
| KPI tiles (My Day)       | ✅   | ✅    |                                                                    |
| Kanban columns           | ✅   | ⚠️    | Card backgrounds need a light variant.                             |
| Force-change form        | ✅   | ⚠️    | Amber highlight bleeds into the light surface.                     |

Until the light variant is fully complete, the theme toggle should
be hidden behind a `LIGHT_MODE_BETA=true` env flag — that is being
proposed in §5.D of the findings brief.

## 7. Focus rings + a11y

- Every interactive element shows a visible focus ring on `:focus-visible`.
- Tailwind's `focus:ring-2 focus:ring-accent focus:ring-offset-2` is
  the default; specific components may extend.
- Keyboard reachability: every form, button, and dropdown is
  reachable via Tab order and operable via Enter / Space.
- `axe-core` runs in CI on the e2e harness; no new violations may
  ship.

## 8. Motion

- Toast fades use 500ms ease-out.
- Sidebar collapse uses 200ms ease-in-out.
- Hover state changes are 150ms ease-out.
- No bouncy / spring physics.
- Respect `prefers-reduced-motion`: any of the above transitions
  drop to 0ms when the user requests it (TODO; current code does not
  honor this — tracked as a follow-up).

## 9. Dates and times

- Server-rendered times use UTC ISO 8601 strings until they hit a
  client component.
- The `LocalTime` component (`src/components/local-time.tsx`) is the
  single conversion site; it formats relative (`5 minutes ago`) or
  absolute (`Apr 5, 2026, 12:34 PM`) per its `mode` prop.
- Calendar headers show month names ("April 2026"), not numeric
  dates ("2026-04"). Tracked as a polish item under §6.Scheduling.

## 10. Permissions UI

- A button or input that the current role cannot use is **hidden**
  rather than disabled, unless the disabled state is itself
  informative (e.g. "Can't transition: PENDING_DELIVERY needs a
  scheduled job").
- The reason for any permission denial is communicated via the
  redirect target's toast — never as silent navigation.
