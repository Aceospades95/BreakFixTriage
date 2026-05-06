# ADR 0003 — Quote hold-window default: minimum 1 day, default 7

**Status:** Accepted.

**Date:** 2026-05-06.

## Context (and the bug it closes)

The audit (§4 bug 4d) found that the admin → settings page accepts a
hold-window of 0 days. With holdDays = 0:

    holdUntil = now.getTime() + 0 * DAY = now.getTime()

i.e. the quote's hold window expires the moment it is sent. The very
next sweep (whether scheduled or via the "Run hold-window sweep"
button) auto-flips the quote to `NO_RESPONSE` and the ticket to
`QUOTE_NO_RESPONSE`. That is never what an admin meant when they
typed "0".

The previous behavior was technically a 0-second grace period, not
"never expires". There is no ergonomic way to mean "never expires"
through this setting — leave `holdUntil` blank on the per-quote send
form for that.

## Decision

- The schema (`holdWindowSchema` in `src/lib/settings/settings.ts`)
  is `z.coerce.number().int().min(1).max(90)`.
- The admin → settings input has `min={1} max={90}` and a hint
  explaining that 0 would auto-expire on next sweep.
- The server action (`updateSettingsAction` in
  `src/server/actions/settings.ts`) double-validates and rejects
  values outside [1, 90] with an explicit error message.
- The fallback when the setting is unset remains 7 (in
  `getHoldDays`).
- Per-quote-send overrides via the SendQuote form still go through
  `holdWindowSchema`, so the same rule applies there.

## Migration note

If any deployment has `quotes.defaultHoldDays` saved as 0 in the
`AppSetting` table from before this fix, the next call to
`getHoldDays` will fail validation and silently fall back to 7
(because `holdWindowSchema.safeParse(0).success === false`). This is
a soft, no-action-required migration — admins will see 7 in the
input on next page load and can change it.

A one-off SQL nudge (manual, not auto-run) is:

    UPDATE "AppSetting"
    SET value = '7', "updatedAt" = now()
    WHERE key = 'quotes.defaultHoldDays' AND value = '0';

## Consequences

- A 0-day window can no longer be saved, so the bug cannot recur.
- Test: `tests/hold-window.test.ts` pins the schema contract.
- The "tooltip explaining semantics" required by the audit brief is
  the hint text on the input plus this ADR.

## Alternatives considered

- **Keep min=0 with a tooltip.** Rejected — operational mistakes happen,
  and a tooltip is not a guard.
- **Reinterpret 0 as "never expires" and skip the sweep for those.**
  Rejected — it conflates "blank holdUntil" (already the
  no-expiry path) with the configured default. Two ways to mean the
  same thing is one too many.
