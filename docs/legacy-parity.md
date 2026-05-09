# Legacy parity — Google Sheet ↔ Web app

Reconciles the legacy spreadsheet "FOR DEVELOPING TRIAGE Copy of NY
Triage - Bronx" + the bound "Bronx NY Triage AppsScript" against the
current web app, per the §3 brief. This is a static-analysis pass —
verified by reading the code, not by side-by-side use. Anything below
the "needs live verification" cut should be confirmed once the e2e
harness is up.

Status legend:
- **present** — the web app has a first-class equivalent of the legacy
  surface, and the underlying data model supports it.
- **partial** — equivalent exists but missing a piece of the legacy
  behavior (e.g. the data is there, but no UI groups it that way).
- **missing** — no equivalent today; needs design + implementation.

## A. Spreadsheet tabs

| Legacy tab          | Web-app status | File / route reference                                                        | Proposed action                                                                                                                              |
| ------------------- | -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SNOW STAGING        | present        | `/imports/new`, `src/lib/import/servicenow.ts`                                | None — file-upload + the `prisma/sync-servicenow.ts` cron cover this.                                                                        |
| ESCALATIONS         | partial        | `prisma/escalate-stale.ts` (notification job), no view                        | Add a `/dashboards/escalations` view derived from breached SLA. Filed.                                                                       |
| PICKUP              | present        | `/tickets?state=AWAITING_PICKUP`, `/tickets?state=PICKUP_SCHEDULED`           | None.                                                                                                                                        |
| INVENTORY           | partial        | Multiple `/tickets?state=...` filters across IN_WAREHOUSE / DIAGNOSIS / AWAITING_PARTS / PARTS_ORDERED / IN_REPAIR / REPAIR_COMPLETED | Add an "Inventory" group/queue page that combines those six states with a single counter. Filed.                                             |
| DELIVERY            | present        | `/tickets?state=PENDING_DELIVERY`, `/tickets?state=DELIVERY_SCHEDULED`, `/tickets?state=RETURNED` | None.                                                                                                                                        |
| INVOICE             | present        | `/invoices`                                                                   | None.                                                                                                                                        |
| MANUFACTURER        | present        | `/tickets?state=MANUFACTURER_RMA`, `src/lib/rma/`                             | None.                                                                                                                                        |
| PRINTERS / RECONNECTS | **missing**  | No device-class queue                                                         | Add `Device.formFactor` filter chips and a "Reconnects" tag on Tickets. Schema already has `FormFactor.PRINTER` and `FormFactor.NETWORK`. Filed. |
| ON-SITE             | present        | `/tickets?state=AWAITING_ONSITE`, `/tickets?state=ONSITE_IN_PROGRESS`         | None.                                                                                                                                        |
| QUOTES              | present        | `/quotes`                                                                     | None for the views; bug 4b fixes the sweep. Decision on `QUOTE_EXPIRED` deferred — see proposed-issues.md.                                   |
| WARRANTY EXTENSION  | **missing**    | No matching state or flag                                                    | Propose `WARRANTY_EXTENSION_PENDING` / `WARRANTY_EXTENSION_APPROVED` substates **or** a flag on `Device`. Recommend the flag — extensions are a property of a device, not a ticket lifecycle. Filed. |
| OUT OF SCOPE        | present        | `/tickets?state=OUT_OF_SCOPE`                                                 | None.                                                                                                                                        |
| HISTORY             | present        | `/tickets?state=CLOSED` + `/audit`                                            | None.                                                                                                                                        |
| ADMIN / ADMIN_DATA  | present        | `/admin/*`, `/dashboards`                                                     | Cutover-compare scripts (`prisma/cutover-compare.ts`) verify volume parity.                                                                  |
| REFERENCE           | present        | `/admin/schools`, `/admin/users`, `/admin/statuses`, `/admin/device-models`, `/admin/parts` | None.                                                                                                                                        |
| Duplicate Check     | partial        | `/duplicates`                                                                 | Two-step "review → delete" gate exists in the data model (`DuplicateConflict.resolution`). The exhaustive UI audit of every deletion path is filed for follow-up. |

## B. Apps Script "Custom Tools" menu

| Legacy menu item                                  | Web-app status                                                | Proposed action                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Highlight Duplicate Incidents                     | present (auto on import — `src/lib/duplicates/`)              | None.                                                                                                    |
| Highlight Duplicate Serial Numbers                | present                                                       | None.                                                                                                    |
| Clear Duplicate Highlights / "mark not duplicate" | present (`DuplicateConflict.resolution = KEEP_BOTH`)          | None.                                                                                                    |
| Delete Highlighted Incident Duplicates            | partial — gate exists, UI confirmation present               | Verify every "delete" call in the UI requires `resolution` to have been set first. Filed for follow-up.  |
| Delete Highlighted Serial Number Duplicates       | partial                                                       | Same as above.                                                                                           |
| Move Rows on Current Sheet (manual transitions)   | present (`/tickets/[id]` transition controls)                 | None.                                                                                                    |
| Move Selected Rows                                | present (`/tickets` bulk actions)                             | None for the action; "required reason" on bulk reassign is filed (§6 of the audit task).                 |
| Move All Rows in All Sheets                       | present (`/admin/settings` → "Bulk close stale")              | None.                                                                                                    |
| Apply Array Formulas (Q & R) to SNOW STAGING      | partial                                                       | The pipeline auto-routes new rows from IMPORTED → TRIAGE, but per-status row-level routing on **import** of in-flight tickets needs a written check. Filed. |
| Apply Conditional Formatting Rules                | present (SLA badge + state pill colors in `/tickets`, `/bench`, dashboards) | None — but the legacy color palette mapping (e.g. red = breached) should be visually reviewed live. Filed.                |

## C. What's covered by tests today

The cutover scripts (`prisma/cutover-{compare,export,integrity}.ts`)
implement a row-by-row reconciliation against a CSV exported from the
legacy sheet. Their unit tests are at `tests/cutover-*.test.ts`.
Treat those as the parity *test plan*, not just dev tooling — they
are the one place the parity claim is mechanically checked.

## D. Open parity questions (need maintainer input)

1. Should `QUOTE_EXPIRED` be its own state, or do we keep funneling
   APPROVED-with-expired-hold into NO_RESPONSE? See
   `docs/proposed-issues.md`.
2. Should warranty extension be a state on `Ticket` or a flag on
   `Device`? Recommendation: flag on Device.
3. Should Reconnect work be a `formFactor` (so a tagged "phone w/
   reconnect-only" ticket is filterable), or a separate tag? Today
   `FormFactor` is a coarse list — adding a Reconnect *tag* on the
   ticket avoids inflating the device type list.
