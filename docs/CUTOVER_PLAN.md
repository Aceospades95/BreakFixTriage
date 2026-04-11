# BreakFix Triage — Cutover Runbook

This document is the operational playbook for Phase 5 of
`docs/MIGRATION_PLAN.md`: moving the team off the legacy spreadsheet
and onto BreakFix Triage as the authoritative system of record. It is
intentionally checklist-shaped.

The guiding principle is: **no cutover step is irreversible until the
legacy sheet is archived at step 6.** Every step before that can be
rolled back by simply closing the app and continuing to work in the
sheet.

## 0. Prerequisites

- [ ] Phases 0–4 deployed and in use by at least one district for
      two full business weeks.
- [ ] `BOOTSTRAP_ADMIN_*` env vars set; the admin account can sign in.
- [ ] At least one `DISPATCHER`, `WAREHOUSE`, and `DRIVER` account
      created and used for a week.
- [ ] `NOTIFICATION_TRANSPORT=smtp` configured and verified by
      sending a test quote (see Phase 4).
- [ ] If using the Google Routes optimizer: billing account verified,
      daily quota alerts set, one real route built with it.
- [ ] If using the ServiceNow API connector: read-only integration
      user provisioned, `SERVICENOW_*` env vars populated, one
      successful `npm run servicenow:sync` cycle on staging.
- [ ] Postgres backup schedule in place. On Unraid the
      "User Scripts" plugin + `pg_dump` is sufficient; anywhere else
      follow your usual backup policy.
- [ ] Legacy spreadsheet handed to an owner who can flip it to
      "View only" at a moment's notice.

## 1. Freeze new writes against the legacy sheet

The cutover assumes only the new system receives edits from step 2
onwards. Before that point, freeze the legacy sheet so nobody
accidentally writes there.

1. **Announce:** email operations with the exact freeze time (T-24h).
2. **Revoke editors:** in Google Drive, change every user except the
   owner to `Viewer`. Keep edit access for the cutover lead only.
3. **Snapshot:** export the full sheet to CSV and stash it under
   `docs/legacy/cutover-snapshot-YYYY-MM-DD.csv` (not committed; keep
   it in the team drive).
4. **Verify** by attempting to edit a cell as a non-lead account. The
   sheet should refuse the write.

## 2. Final import of historical tickets

Re-run the CSV/XLSX importer (or the ServiceNow API connector) to
make sure BreakFix Triage is fully current with everything the sheet
knew about:

```bash
# Either via the UI
/imports/new → upload the snapshot from step 1

# Or from the CLI on the server host
npx tsx scripts/import-sample.ts cutover-snapshot-YYYY-MM-DD.csv
```

- Expect a large number of `UPDATED` rows and a handful of `CREATED`
  rows for tickets that the team entered directly into the sheet
  without ever going through ServiceNow.
- Any row that lands in the duplicate queue must be resolved at
  `/duplicates` before moving on.

## 3. Integrity scan

```bash
npm run cutover:integrity
```

Exits `0` and returns an empty `issues` array when the database is
clean. Otherwise it dumps a JSON report with every problem it found.
Work through the list before proceeding:

| Check                                   | Fix                                                        |
|-----------------------------------------|------------------------------------------------------------|
| `ticket_closed_no_timestamp`            | Backfill `closedAt` via SQL or reopen/re-close the ticket. |
| `ticket_closedat_wrong_state`           | Either transition the ticket to `CLOSED` or null out `closedAt`. |
| `ticket_invoice_required_flag_mismatch` | Flip `invoiceRequired` to match the state.                 |
| `school_missing_address`                | Add the address via the admin UI or the schools import.    |
| `school_missing_coordinates`            | Geocode and update the `Address.latitude/longitude`.       |
| `device_missing_serial`                 | Patch the serial on the device record or delete it.        |
| `orphan_quote` / `orphan_job`           | Usually a raw SQL load — delete the orphan or restore its parent. |
| `user_role_missing`                     | Assign a role in the admin UI.                             |

Re-run until the scan is green.

## 4. Parallel run (one business week)

Starting the morning after step 3, run the comparison tool daily at
5pm, after the field team has closed out for the day:

```bash
npm run cutover:compare -- cutover-snapshot-YYYY-MM-DD.csv
```

The script exits non-zero if **any** of the following is non-empty:

- `onlyInLegacy` — tickets ops entered only into the sheet. They
  should land in BreakFix Triage via step 2's importer; if they
  appear here, either the sheet has rows the importer skipped
  (usually bad DBN/incident numbers) or ops is still writing to the
  sheet in violation of step 1.
- `onlyInDb` — tickets only in BreakFix Triage. Expected if the team
  started entering data directly into the app; make sure the numbers
  match what ops actually worked on.
- `drift` — both sides have the row but disagree on state / school /
  serial. Investigate each one. Drift on `state` is the most common
  and usually means the ops lead edited the sheet after the freeze —
  see step 1.

Commit the JSON output of each daily run to `docs/legacy/compare/`
(gitignored locally) so the team has an audit trail.

**Exit criteria for step 4:** three consecutive daily comparisons with
zero drift and zero unexplained sheet-only tickets.

## 5. Cutover day

### Morning

1. **Freeze writes on BreakFix Triage too:** set `READ_ONLY_MODE=true`
   in the container env and redeploy. A banner appears at the top of
   every page; all non-GET requests return 503 at the middleware
   layer.
2. **Final export:**
   ```bash
   npm run cutover:export > cutover-final-YYYY-MM-DD.csv
   ```
   Stash this file alongside the step-1 snapshot. It is the "as-of
   cutover" canonical state.
3. **Final integrity scan:** `npm run cutover:integrity` — must be
   clean.
4. **Final comparison** against the day-zero snapshot: `npm run
   cutover:compare -- cutover-snapshot-YYYY-MM-DD.csv`. Must be clean.

### Flip

5. **Unfreeze BreakFix Triage:** remove (or set to `false`)
   `READ_ONLY_MODE` in the container env and redeploy. The banner
   disappears and writes resume.
6. **Archive the legacy spreadsheet:** remove every user's edit access
   except one "break-glass" account. Rename the sheet to
   `[ARCHIVED] BreakFix Triage — pre-cutover YYYY-MM-DD`.
7. **Announce cutover complete** in whatever channel operations
   watches. Include the list of known issues surfaced by steps 3–4 so
   nobody is surprised.

### Afternoon

8. **Run the first live route builder session** with a dispatcher
   shadowing the cutover lead, to catch any Phase 2 issues that the
   parallel run didn't exercise.
9. **Walk one ticket end-to-end** through its lifecycle: import →
   pickup → warehouse → repair → delivery → close. Record any hiccups
   under `docs/legacy/postcutover-notes.md`.

## 6. Post-cutover monitoring

Run daily for two weeks after cutover:

```bash
npm run quotes:sweep         # auto-expire anything that slipped through
npm run cutover:integrity    # catch drift before ops notices
```

Watch the audit log for anomalies:

```sql
SELECT action, COUNT(*)
FROM "AuditLog"
WHERE "createdAt" > NOW() - INTERVAL '1 day'
GROUP BY 1
ORDER BY 2 DESC;
```

Investigate any action that is new versus the pre-cutover baseline.

## 7. Rollback

Cutover is reversible only before step 6. To roll back:

1. Set `READ_ONLY_MODE=true` on BreakFix Triage and redeploy.
2. Restore edit access to the legacy spreadsheet.
3. Tell operations to work in the sheet again.
4. File a post-mortem explaining which exit criterion failed and what
   needs to change before the next attempt.

After step 6 (archiving the sheet) rollback requires restoring the
sheet from its Drive version history and manually reconciling any
edits that landed in BreakFix Triage between the archive and the
rollback.

## Scripts reference

| Script                     | Purpose                                               |
|----------------------------|-------------------------------------------------------|
| `npm run cutover:compare`  | Parallel-run comparison against a legacy CSV/XLSX    |
| `npm run cutover:integrity`| Pre/post-cutover integrity scan                       |
| `npm run cutover:export`   | Dump the ticket table as CSV for manual reconciliation |
| `npm run quotes:sweep`     | Expire overdue quotes                                 |
| `npm run servicenow:sync`  | Pull the current ServiceNow queue                     |
| `npm run db:bootstrap`     | Ensure an initial ADMIN user exists                   |
