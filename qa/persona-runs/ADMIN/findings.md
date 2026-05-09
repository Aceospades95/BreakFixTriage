# ADMIN — static walkthrough findings

Test user: `admin@breakfix.local` / `breakfix-dev` (`Alex Admin`).

## Reachable navigation (verified by reading `src/components/sidebar.tsx`)

- `/` (My Day) — full manager view: ops attention KPIs, team queues,
  today's routes, oldest SLA-breached.
- `/tickets` — list, filters, bulk actions, kanban link.
- `/tickets/[id]` — detail, comments, attachments, transitions, force.
- `/tickets/kanban` — drag-and-drop board.
- `/bench?scope=all` — all-bench manager view (default for ADMIN).
- `/quotes` — full list with sweep button.
- `/invoices` — INVOICE_REQUIRED queue.
- `/duplicates` — duplicate review.
- `/scheduling` — routes, jobs, calendar.
- `/imports` and `/imports/new` — file upload + commit.
- `/dashboards` (+ `/devices`, `/finance`, `/productivity`).
- `/audit` — AuditLog viewer.
- `/admin` — users, schools, devices, parts, models, statuses,
  settings, templates, districts, permissions.
- `/scan` — QR scanner.
- `/profile` and `/profile/2fa`.
- `/notifications`.

## Issues found

### Bench: All-benches shows only Unassigned (S2)
- **Where:** `src/app/(app)/bench/page.tsx` (manager branch).
- **Repro (post-seed):** sign in as ADMIN → `/bench` → only the
  Unassigned bucket renders.
- **Root cause:** `prisma/seed.ts` never sets `assignedUserId` on any
  ticket, so `byAssignee.groupBy()` returns an empty array and the
  manager view has no per-assignee buckets to render.
- **Fix:** `prisma/seed.ts` now assigns `INC1000003` to the seeded
  ADMIN user (Alex Admin) so the manager view has demonstrable data.
  Also `bulkAssignAction` and `updateTicketAction` now call
  `revalidatePath("/bench")` and `revalidatePath("/")` so the bench
  and My Day pages re-render after assignment changes (the Next.js
  Router cache could otherwise serve stale data after navigation).
- **Initial-paint blank:** when only the Unassigned bucket exists,
  the `lg:grid-cols-2` grid leaves the right half empty — looks like
  the page is "clipped". Mitigated by the seed change above plus
  collapsing to one column when there is only one bucket.

### Admin → Settings: hold-window accepts 0 (S3)
- **Where:** `src/lib/settings/settings.ts` (`holdWindowSchema`),
  `src/app/(app)/admin/settings/page.tsx` (the input).
- **Behaviour:** if the admin saves 0, the next quote sent has
  `holdUntil = now`, so the very next sweep auto-expires it.
- **Fix:** schema now `min(1) max(90)`, input has `min={1}`, hint
  text explicitly explains "1 = expire after 1 day". The default
  fallback when the setting is unset remains 7. Migration note in
  `docs/adr/0003-hold-window-min-1.md`.

### Admin → Force change
- Spot-checked. ADMIN can pick any state from the dropdown. The
  server action rejects non-ADMIN actors trying to force, and the
  engine writes `payload.forced = true` plus the audit row. No issue.

### Admin → Bulk close stale
- Confirmation modal exists (`ConfirmButton`). Action runs through
  the state machine so guards still apply. Spot-checked; no issue.

## Not exhaustively tested (would need live app)

- Every form submission with empty / max-length / wrong-type / non-UTF-8
  CSV / duplicate incident # / malformed ATS code. The import pipeline
  has dedicated tests (`tests/import-mapper.test.ts`,
  `tests/servicenow.test.ts`) so behavior is partially covered by
  unit tests, but per-page form ergonomics need a browser run.
- Admin permission editor — the persistence path
  (`AppSetting` overrides) has unit tests; the editor UI was not
  driven.
- 2FA enrollment flow — covered by `tests/totp.test.ts`; UI not driven.
