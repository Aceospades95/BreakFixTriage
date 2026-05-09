# humanise allowlist

The `humaniseEnum` / `humanise` helpers and the forbidden-tokens
grep gate (`scripts/check-forbidden-tokens.sh`) collectively enforce
that no raw `ALL_CAPS_UNDERSCORE` text leaks to user-facing JSX.

This file documents the legitimate exceptions where ALL CAPS is
intentional — visual section labels, CSS-uppercased headings, and
acronyms preserved by `humaniseEnum`.

## Section labels (CSS `tracking-wide`, NOT enum text)

The styled label tone has tighter tracking so it reads as a header,
not a value. These aren't flagged because the surrounding regex
demands an underscore character; section labels never carry one.

  - VEHICLE
  - OPTIMIZER
  - LAST OPTIMIZED
  - OPS ATTENTION
  - BULK ACTIONS
  - DEVICE
  - TRACKING
  - SUMMARY
  - DETAILS

Round-3 ratified these as styled labels rather than enum values.

## Acronym-preserved words (humaniseEnum keeps them upper)

`humaniseEnum` lowercases everything except a known acronym list
documented in `docs/ui-conventions.md` §2:

  - RMA
  - SLA
  - OOW
  - PO
  - SN
  - DBN
  - NYC
  - ID
  - SPOC
  - URL
  - API
  - CSV
  - SMTP
  - INC

These render in their original case after `humaniseEnum("OUT_OF_RMA")`
→ "Out of RMA". Adding a new acronym means editing
`humaniseEnum` and listing it here.

## Forbidden-tokens enum hardcoded list (Round-7 §2A + §2B)

`scripts/check-forbidden-tokens.sh` Rule 5 explicitly flags the
following enum values when they appear in JSX text. Each is
intentionally listed because the underscore-required Rule 2 misses
them:

  - QuoteStatus: DRAFT, SENT, APPROVED, DECLINED, CANCELLED, NO_RESPONSE
  - ImportType: TICKETS, SCHOOLS, DEVICES, USERS, PARTS, DEVICE_MODELS
  - ImportSource: SN_CSV, MANUAL_CSV, SNOW_API, SERVICENOW, SERVICE_NOW
  - JobType: PICKUP, DELIVERY, ONSITE_REPAIR
  - TicketPriority: LOW, NORMAL, HIGH, CRITICAL

Adding a new enum to a user-facing surface means either humanising
the render OR adding the values here so the gate catches future
regressions.

## `.cigrep-allow` (regex-per-line, currently empty)

The runtime allowlist file `.cigrep-allow` ships empty. Populate
only when the matched token is genuinely correct (e.g. a country /
state code chip that legitimately renders ALL CAPS, or a documented
acronym `humaniseEnum` already preserves). Do NOT use this file to
silence devnote-style leaks.

Each line is a regex; the matched literal token (NOT the surrounding
line) is suppressed. Lines starting with `#` are comments.
