# Assumptions & Open Questions

Captured at the start of Phase 0. Each assumption is a decision we made
without explicit confirmation; each open question is something that would
change our approach if answered differently.

## Assumptions

1. **Single deployable, single DB.** One Next.js app + one Postgres database
   serves all districts. Multi-tenancy is row-level via `districtId`, not
   per-tenant databases.
2. **ServiceNow incident number is globally unique.** We treat it as the
   natural key for tickets.
3. **Device serial number is the natural key for a device.** Two tickets with
   the same serial are related to the same physical device.
4. **Tickets may exist without a known device** (e.g., "printer in room 12 is
   broken" with no serial). `Ticket.deviceId` is nullable.
5. **A ticket belongs to exactly one school at a time.** Transfers between
   schools would require a new ticket.
6. **Operational staff are internal users.** Schools and external POCs are
   `Contact` rows, not `User` rows. They do not log in (yet).
7. **Email sending is out of scope for Phase 0.** We record the intent
   (`Notification` rows) and rely on the stdout transport in dev.
8. **Route optimization is a solvable hand-wave in Phase 0.** Default
   optimizer is straight-line nearest-neighbor. Good enough to validate the
   domain model and UI; real optimization ships in Phase 4.
9. **Google Workspace SSO exists** but is not required to log in during
   development — credentials provider remains available.
10. **Closed tickets can be reopened.** Re-ingesting an incident that matches
    a CLOSED ticket creates a `REOPENED` event rather than a second ticket.
11. **Invoice-required closures are configurable per district**, defaulting
    to off, because not every district contract requires invoicing.
12. **Quote hold window default is 10 business days.** Configurable per
    district.
13. **All timestamps stored in UTC**, rendered in `America/New_York` for UI.

## Open questions (not blocking Phase 0)

1. What exact ServiceNow fields do the current exports include? We will
   confirm by examining a real export in Phase 1 and adjust the importer's
   field mapping table. Until then, the mapper handles a superset of the
   fields named in the task brief.
2. Is there a legal requirement to retain ticket history for a minimum
   period? Affects archival policy for CLOSED tickets.
3. Are technicians/drivers expected to use BreakFix Triage from mobile
   devices in the field? Affects how much effort goes into mobile-friendly
   layouts for the day view.
4. Do quotes need e-signature collection, or is text approval sufficient?
5. Will Google Routes billing be acceptable, or should we plan for an open
   alternative (OSRM/Valhalla) as the production optimizer?
6. Are there any NYC DOE security/compliance rules (FERPA, CJIS-like) we
   must address beyond standard app security hygiene?
7. Is there existing Workspace SSO provisioning (Workspace groups) we should
   map to roles automatically?

None of the above block Phase 0 scaffolding. Each is marked `TODO(open-Q-#)`
in code where relevant.
