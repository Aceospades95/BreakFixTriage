# Round-7 assumptions

Choices made under ambiguity. Each entry: what was unclear, what we
picked, why.

## §1A device transfer schema

**Ambiguity:** the brief noted that the survivor INC may already
carry a different device, in which case the picked-up device(s)
should "append to a new RouteStopDevice-style relation on the
ticket (or Ticket.devices[] — schema choice is yours, document it
in an ADR)".

**Choice:** keep the existing single-`Ticket.deviceId` schema; treat
the StopDevice ledger as the source of truth for "every device that
showed up on this ticket via a route".

**Policy ("first device wins on Ticket.deviceId"):**
  - Survivor's `deviceId` is `null` → fill it from the source's
    `deviceId` on merge.
  - Survivor's `deviceId` is already set → keep it. The transferred
    device is still re-pointed in StopDevice + listed in the merge
    comment + audit row, so the operator-readable trail is intact;
    the single-field shorthand on the ticket reflects the SNOW-issued
    primary device.

**Why no schema migration:** Round-7 forbids scope expansion.
`Ticket.devices[]` would require a new join table + UI everywhere
that today reads `ticket.device.serialNumber`. Filed as a Round-8
ADR candidate.

## §1B `/admin/*` 404 strategy

**Ambiguity:** brief allowed a single-file `app/(admin)/not-found.tsx`
re-exporting the global, OR moving the global up the tree.

**Choice:** add catch-all `[...notfound]/page.tsx` files at
`(app)/admin/` and `(app)/` that call `notFound()`.

**Why:** the pre-existing `(app)/admin/not-found.tsx` was already
reachable from `notFound()` calls inside the segment, but there was
no entry point for true URL misses (e.g. `/admin/foo`). The
catch-all pattern uses Next.js's lowest match priority so any real
admin page wins; misses funnel to `notFound()` → `(app)/admin/not-
found.tsx`. Both not-found pages now ship a `data-testid="chromed-
not-found"` marker for the Playwright assertion when CI provisions
a browser.

## §2B SOURCE abbreviation policy

**Ambiguity:** brief offered "ServiceNow CSV" or "SN CSV" — pick
one and document.

**Choice:** "ServiceNow CSV" (full word).

**Why:** the imports table is a low-traffic surface; non-technical
ops users (school admins reviewing a CSV upload) shouldn't have to
decode the SN abbreviation. Width budget on the table is generous
because we already humanised the TYPE chip in the same row.

`SN_CSV` → "ServiceNow CSV", `MANUAL_CSV` → "Manual CSV", `SNOW_API`
→ "ServiceNow API". Map lives in `app/(app)/imports/page.tsx`
under `SOURCE_LABELS`. Adding a new source = one map entry.

## §2F portal ticket cards target

**Ambiguity:** brief offered two paths for the anchor:
  (a) Token-scoped read-only ticket detail at
      `/portal/{token}/tickets/{INC#}` with description, status
      timeline, school-visible comments, recent attachments.
  (b) Anchor to `#ticket-{INC#}` on the same portal page.

**Choice:** option (b) — same-page anchor.

**Why:** option (a) is a list-page-of-its-own workstream (visibility
filtering on comments, attachment download permission, status
timeline render that doesn't leak operator detail). R7 forbids
scope expansion. Option (b) preserves keyboard nav + focus ring
today (the brief's headline accessibility ask) and leaves option (a)
filed for R8.

The anchor target = the same card's `id`. Clicking is essentially
a no-op visually but lands focus on the card and gives the
deep-link a stable URL to share.

## §3A integration test depth

**Ambiguity:** brief asked for an end-to-end Vitest/Playwright
integration test (assert `EmailLog` row, `Notification` row, bell
endpoint count).

**Choice:** structural smoke tests in `tests/notification-triggers.
test.ts` only this round. The integration test is filed in
`docs/round-7-backlog.md`.

**Why:** the audit env has no Postgres + no provider; an integration
test that depends on either is a CI infrastructure work item, not a
Round-7 ticket. The structural smoke covers the dispatch wiring
(enum, template seed, call site, chokepoint guard) — what we can
verify today.

## §3B: which exact event for the school-approved quote

**Ambiguity:** brief asked for `quote_approved`. The existing
`quote_approved_internal` event fires when an operator approves
on the school's behalf.

**Choice:** add `quote_approved` as a separate enum value. Both
coexist:
  - `quote_approved` — school user (or operator) approves; recipient
    designed for the SPOC + reporter (the school side).
  - `quote_approved_internal` — internal-only follow-up for
    accounting / dispatch.

The `respondQuoteAction` server action fires `quote_approved` when
`response === "APPROVED"`. The internal variant stays where it
was (no Round-7 changes to that path).

## §3C school-match policy

**Ambiguity:** brief asked the importer to auto-merge same-school
synth + INC; cross-school case → no merge but write a comment.

**Choice:** strict same-school merge only.

**Why:** an on-route synthetic always carries `schoolId` (the stop's
school), and a SNOW INC carries the school it was logged against.
A serial collision across schools is almost always a transcription
error or a device that physically moved between schools without an
asset transfer — both demand human review, not an automatic merge.

The cross-school path posts a comment on the synthetic noting the
collision and writes an audit row tagged
`snow-merge.cross-school-collision` so the operator sees it in
`/admin/audit` filter "User" + "snow" search.

## §3C multi-synthetic ordering

**Ambiguity:** brief asked: "if SYN-X and SYN-Y both exist for the
same school+serial, auto-merge into the older one and post a
comment on the loser."

**Choice:** older = earlier `createdAt`. Picked alphabetically by
ISO timestamp; stable when timestamps are equal (Prisma orders by
the next column otherwise but for our use case ties are
extraordinarily rare).

**Why:** the older synthetic is the one the tech minted on the
route first; the second is most likely a duplicate from a re-add.
Merging into the older one preserves the original audit trail
(photos, signatures, time entries) on the surviving record.
