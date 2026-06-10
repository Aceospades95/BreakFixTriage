# Round-20 QA checklist

Verification protocol for the NY-team batch. Prereqs:
`npm run db:seed && npm run db:seed:test`. Starred items are pinned
by automated specs (`e2e/round-20.spec.ts` unless noted).

## Confirmed pickups/dropoffs ★ (driver persona spec)

1. Route detail → open the active stop → "Finish this stop" lists
   one checkbox per device line.
2. Tick the confirmation without ticking every device → the button
   stays disabled with a hint.
3. (Server guard) Submitting a completion without every line
   confirmed redirects with an error naming the unconfirmed
   serials.
4. Complete normally → each StopDevice row carries
   `confirmedAt` / `confirmedByUserId`.

## SPOC scheduled-visit emails ★ (§7 + integration)

1. Admin → Email rules shows seeded (disabled) rules for
   `pickup_scheduled`, `delivery_scheduled`, `stop_delayed`,
   `report_operations`, `report_finance`.
2. Enable pickup_scheduled + delivery_scheduled → build a route →
   /admin/email-log shows one row per ticket on the route with the
   matching template, addressed to the school's opted-in SPOC.
3. The repaired ticket_created rule no longer contains the invalid
   `school_spoc` recipient kind.

## Delay reporting ★ (§2)

1. Active stop → "Running late? Report a delay" → Weather, 45 min,
   note → save.
2. Green banner says the school was emailed (or that the rule is
   disabled); stop summary shows the amber "Delayed — Weather
   (+45m)" chip; Timing shows the pushed estimate.
3. With the stop_delayed rule enabled, /admin/email-log gains a
   "running late" email per ticket on the stop.

## Expenses ★ (§3)

1. Any signed-in user → profile → My expenses → submit $2.90
   Transit with a description; optionally pin to one of your own
   routes; attach a receipt with 📷 Take photo.
2. Withdraw works only while SUBMITTED.
3. Ops → Admin → Expenses → the Mon–Sun view groups by tech with
   locations serviced; Approve/Reject flips the status both sides.
4. Export CSV downloads the same week (`?week=` navigates).

## Scheduled reports (manual + integration tests)

1. `npm run reports:daily` (and weekly/monthly) prints how many
   rules dispatched; with rules disabled it says so and sends
   nothing.
2. With report_operations enabled + a literal recipient, the email
   contains the monospace summary block; the weekly finance report
   embeds the per-tech expense breakdown.

## PO generation ★ (§4)

1. Ticket with an APPROVED quote → "Generate PO for customer" →
   lands on the printable sheet with `PO-<year>-<seq>`, bill-to
   district/school, amount, signature line.
2. Ticket page now shows the PO number + "Print PO" link; /invoices
   reflects the PO.

## Team notes ★ (§1)

1. Dispatcher/ops → Team notes → post a note (optional auto-expiry).
2. Every signed-in user sees the amber 📣 banner on every page;
   "Got it — acknowledge" removes it for that user only.
3. The manage page lists acknowledged vs still-pending names;
   Retire stops the banner for everyone. Acks + posts + retires all
   land in the audit log.

## Location sorting ★ (§5)

1. /tickets → click "School" header (A–Z both directions); click
   the small `#` for DBN-code order. Filters survive the sort.
2. /admin/schools → Name A–Z / DBN code toggles.

## Tech schedule ★ (§6)

1. Driver/tech → My schedule → "My upcoming routes" lists assigned
   routes (date, status, stop sequence) with one-click Open route.

## Gates

tsc ✓ · build ✓ · vitest 930 ✓ · Playwright 197 ✓ ·
forbidden-tokens ✓ · CI fully green on `aa6f9ac`.
