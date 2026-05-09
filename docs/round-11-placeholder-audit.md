# Round-11 §1B — placeholder audit

## Convention

Input `placeholder` values fall into three categories. Round-11
unified the rule across the entire app.

### Category 1 — example value (gets `e.g. ` prefix)

The placeholder is a literal sample of what the user types into
the field. The placeholder is the answer, not the question.

Format: `e.g. <sample>`

### Category 2 — instruction (plain text, no prefix)

The placeholder describes what the field is or what to do. It's
the question, not the answer.

Examples kept plain: `Search by SKU or name`, `Reason (optional)`,
`Why this resolution?`, `Incident or description`, `Van #, plate,
etc.`, `Short description — becomes the ticket title`.

### Category 3 — field label / structural input (plain text)

Single-word field labels that double as instruction. These are
short, unambiguous, and adding `e.g.` would make them awkward.

Examples kept plain: `Line 1`, `City`, `ZIP`, `Latitude`, `Email`,
`Phone`, `Title`, `None`, `optional`.

## Decision rule

When in doubt, ask: *would this exact text be a valid value the
user could type?* If yes → category 1, prefix with `e.g.`. If no
→ category 2 or 3, leave plain.

## R11 changes

26 placeholders moved to the `e.g.` convention.

| File | Field | Before | After |
|------|-------|--------|-------|
| `src/app/(app)/duplicates/page.tsx` | SNOW INC# | `INC#` | `e.g. INC1234567` |
| `src/app/(app)/scheduling/routes/new/page.tsx` | Vehicle ref | `VAN-02` | `e.g. VAN-02` |
| `src/app/(app)/admin/audit/page.tsx` | Actor email | `alex@…` | `e.g. alex@…` |
| `src/app/(app)/admin/holidays/page.tsx` | Holiday label | `Memorial Day` | `e.g. Memorial Day` |
| `src/app/(app)/admin/parts/new/page.tsx` | SKU | `SCREEN-EB14` | `e.g. SCREEN-EB14` |
| `src/app/(app)/admin/parts/new/page.tsx` | Name | `14-inch replacement screen` | `e.g. 14-inch replacement screen` |
| `src/app/(app)/admin/parts/new/page.tsx` | Cost | `89.00` | `e.g. 89.00` |
| `src/app/(app)/admin/parts/new/page.tsx` | Location | `A3-shelf-2` | `e.g. A3-shelf-2` |
| `src/app/(app)/admin/districts/page.tsx` | District name | `Bronx` | `e.g. Bronx` |
| `src/app/(app)/admin/districts/page.tsx` | District code | `BRONX` | `e.g. BRONX` |
| `src/app/(app)/admin/districts/page.tsx` | Region | `NYC` | `e.g. NYC` |
| `src/app/(app)/admin/schools/new/page.tsx` | DBN | `11X101` | `e.g. 11X101` |
| `src/app/(app)/admin/schools/new/page.tsx` | School name | `P.S. 101 Bronx` | `e.g. P.S. 101 Bronx` |
| `src/app/(app)/admin/schools/new/page.tsx` | Latitude | `40.8448` | `e.g. 40.8448` |
| `src/app/(app)/admin/schools/new/page.tsx` | Longitude | `-73.8648` | `e.g. -73.8648` |
| `src/app/(app)/admin/schools/[schoolId]/page.tsx` | SPOC label | `Jane Doe · IT lead` | `e.g. Jane Doe · IT lead` |
| `src/app/(app)/admin/devices/new/page.tsx` | Manufacturer | `Acme` | `e.g. Acme` |
| `src/app/(app)/admin/devices/new/page.tsx` | Model | `EduBook 14` | `e.g. EduBook 14` |
| `src/app/(app)/admin/devices/new/page.tsx` | Warranty months | `36` | `e.g. 36` |
| `src/app/(app)/invoices/page.tsx` | PO # | `PO-2025-00123` | `e.g. PO-2025-00123` |
| `src/app/(app)/invoices/page.tsx` | Amount | `199.00` | `e.g. 199.00` |
| `src/app/(app)/profile/2fa/page.tsx` | TOTP code (×2) | `123456` | `e.g. 123456` |
| `src/app/(app)/scan/scan-client.tsx` | Manual scan | `INC2200126, SN-1234, BX-101` | `e.g. INC2200126, SN-1234, BX-101` |
| `src/app/(app)/scan/warehouse/scan-warehouse-client.tsx` | Manual scan | `SN-0001 / AT-0001` | `e.g. SN-0001 / AT-0001` |

## Already conformant before R11

| File | Field | Placeholder |
|------|-------|-------------|
| `src/app/(app)/admin/templates/page.tsx` | Template name | `Name (e.g. "Cracked screen")` |
| `src/app/(app)/admin/statuses/status-editor.tsx` | Status label | `e.g. Awaiting Approval` |
| `src/app/(app)/admin/settings/page.tsx` | Bulk-close reason | `e.g. Annual cleanup, 2026` |
| `src/app/(app)/admin/tools/bulk-close/page.tsx` | Reason | `Reason (recommended) — e.g. Annual cleanup, 2026` |
| `src/app/(app)/admin/schools/[schoolId]/page.tsx` | SLA | `e.g. 180` |

## Intentionally plain (instructions or labels)

The list below is the full set of placeholders that stay without
the `e.g.` prefix because they are category 2 or 3.

- `123456 or recovery code` — hybrid instruction with format hint
- `Search by SKU or name` — search instruction
- `Search by name or code` — search instruction
- `Search by name` — search instruction
- `Search nav, INC2200126, school code, SN-…` — search hint with
  multiple example fragments and an instruction prefix; the
  inline examples already serve the same purpose as `e.g.`
- `Reason`, `Reason (optional)`, `reason (optional)`, `Why this
  resolution?` — instruction
- `Serial #`, `Asset tag (optional)`, `Condition / notes` — fields
  describing themselves
- `Line 1`, `Line 2`, `City`, `ZIP`, `Latitude`, `Longitude`,
  `Full name`, `Phone`, `Email`, `Title` — single-word labels
- `optional`, `note (optional)`, `notes (optional)` — instruction
- `None` — instruction
- `Incident or description` — instruction
- `Device serial (optional)` — instruction
- `Van #, plate, etc.` — instruction
- `Short description — becomes the ticket title` — instruction
- `Optional long description / triage checklist` — instruction
- `Hinges crack after ~18 months …` — multi-line domain hint, not
  a value the user types

## Future maintainers

When adding a new input, decide which category the placeholder
falls into using the rule above. Add to this doc if the call is
non-obvious. The R11 placeholder gate
(`tests/round-11/placeholder-convention.test.ts`) pins a sample of
the convention so drift is detected.
