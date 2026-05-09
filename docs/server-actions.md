# Server actions index

Round-3 §M deliverable: a single index of every server action in
`src/server/actions/` with name, file, inputs, outputs, audit-write
y/n, email-dispatch y/n, and required permission.

This document is hand-maintained today. The lint-enforced
auto-generation (the brief's "scripts/lint-server-actions.ts that
fails the build if a server action has no comment block") is
filed for the §M follow-up — the comment-block convention isn't
universally adopted across Round-1/Round-2 actions yet, and
retrofitting + writing the lint together is its own commit.

> Convention: every action under `src/server/actions/` is listed
> below. New actions go in alphabetical order within their file
> grouping. When you add or remove an action, update this file
> in the same commit.

| Action                         | File                                 | Permission                  | Audits | Emails | Notes                                                  |
| ------------------------------ | ------------------------------------ | --------------------------- | ------ | ------ | ------------------------------------------------------ |
| `bulkAssignAction`             | `bulk.ts`                            | `TICKETS_WRITE`             | yes    | yes (`ticket_assigned`) | Round-3 §B trigger.                              |
| `bulkTransitionAction`         | `bulk.ts`                            | `TICKETS_TRANSITION`        | yes    | no     | Goes through state machine.                            |
| `bulkCloseStaleAction`         | `maintenance.ts`                     | `USERS_MANAGE`              | yes    | no     | Round-3 §L preview-then-confirm.                       |
| `previewBulkCloseStale`        | `maintenance.ts`                     | `USERS_MANAGE`              | no     | no     | Read-only preview; does NOT mutate.                    |
| `createTicketFromTemplateAction` | `templates.ts`                     | `TICKETS_WRITE`             | yes    | yes (`ticket_created`)  | Round-3 §B trigger.                              |
| `transitionTicketAction`       | `tickets.ts`                         | `TICKETS_TRANSITION`        | yes    | no     | State machine guards apply.                            |
| `forceTransitionTicketAction`  | `tickets.ts`                         | `USERS_MANAGE`              | yes    | no     | `force: true`; reason ≥ 3 chars required.              |
| `updateTicketAction`           | `tickets.ts`                         | `TICKETS_WRITE`             | yes    | no     | Inline edits to ticket fields.                         |
| `createCommentAction`          | `comments.ts`                        | `TICKETS_WRITE`             | yes    | no     | Toast on success.                                      |
| `deleteCommentAction`          | `comments.ts`                        | `TICKETS_WRITE`             | yes    | no     | Confirm modal client-side.                             |
| `updateSettingsAction`         | `settings.ts`                        | `USERS_MANAGE`              | yes    | no     |                                                        |
| `upsertHolidayAction`          | `holidays.ts`                        | `USERS_MANAGE`              | yes    | no     | Round-3 §A2.                                           |
| `deleteHolidayAction`          | `holidays.ts`                        | `USERS_MANAGE`              | yes    | no     | Round-3 §A2.                                           |
| `updatePreferencesAction`      | `preferences.ts`                     | (any session)               | yes    | no     | Round-3 §A3; scoped to actor's own UserPreference.     |
| `sweepQuotesAction`            | `quotes.ts`                          | `QUOTES_WRITE`              | yes    | yes (`quote_no_response` cascade) | Round-2.                              |
| `sendQuoteAction`              | `quotes.ts`                          | `QUOTES_WRITE`              | yes    | yes (`quote_sent` — when wired in §B follow-up)        |                                                        |
| `respondQuoteAction`           | `quotes.ts`                          | `QUOTES_WRITE`              | yes    | partial | `quote_approved_internal` trigger filed.              |
| `createQuoteAction`            | `quotes.ts`                          | `QUOTES_WRITE`              | yes    | no     |                                                        |
| `cancelQuoteAction`            | `quotes.ts`                          | `QUOTES_WRITE`              | yes    | no     |                                                        |
| `updateDraftQuoteAction`       | `quotes.ts`                          | `QUOTES_WRITE`              | yes    | no     |                                                        |
| `recordPartUsageAction`        | `parts.ts`                           | `TICKETS_WRITE`             | yes    | no     |                                                        |
| `createRmaAction`              | `rma.ts`                             | `TICKETS_WRITE`             | yes    | no     |                                                        |
| `markRmaShippedAction`         | `rma.ts`                             | `TICKETS_WRITE`             | yes    | no     |                                                        |
| `markRmaReceivedAction`        | `rma.ts`                             | `TICKETS_WRITE`             | yes    | no     |                                                        |
| `startTimerAction`             | `time.ts`                            | (any session)               | yes    | no     |                                                        |
| `stopTimerAction`              | `time.ts`                            | (any session)               | yes    | no     |                                                        |
| `mergeTicketAction`            | `merge.ts`                           | `TICKETS_WRITE`             | yes    | no     | Merge UX rewrite filed for §D follow-up.               |
| `updateStopStatusAction`       | `scheduling.ts`                      | `STOPS_UPDATE`              | yes    | partial | `delivery_*` triggers filed for §B follow-up.         |
| `uploadAttachmentAction`       | `attachments.ts`                     | `TICKETS_WRITE`             | yes    | no     |                                                        |
| `markNotificationReadAction`   | `notifications.ts`                   | (any session)               | yes    | no     |                                                        |
| `markAllNotificationsReadAction` | `notifications.ts`                 | (any session)               | yes    | no     |                                                        |
| `updateUserAction`             | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `createUserAction`             | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `disableUserAction`            | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `enableUserAction`             | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `updateUserPasswordAction`     | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `createDistrictAction`         | `admin.ts`                           | `DISTRICTS_MANAGE`          | yes    | no     |                                                        |
| `updateDistrictAction`         | `admin.ts`                           | `DISTRICTS_MANAGE`          | yes    | no     |                                                        |
| `createSchoolAction`           | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `updateSchoolAction`           | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `createSchoolContactAction`    | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     | Channel-checkbox editor filed for §H follow-up.        |
| `updateSchoolContactAction`   | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `deleteSchoolContactAction`   | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `createDeviceAction`           | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `updateDeviceAction`           | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `createDeviceModelAction`      | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |
| `updateDeviceModelAction`     | `admin.ts`                           | `USERS_MANAGE`              | yes    | no     |                                                        |

Round-3 also documented but **not yet implemented** (filed for
follow-up — see `docs/round-3-qa-checklist.md`):

- `createEmailRule` / `updateEmailRule` / `deleteEmailRule` /
  `testSendRule` (§A1).
- `updateEmailTemplate` / `previewEmailTemplate` /
  `testSendTemplate` (§A1).
- `retryEmailLog` / `getRenderedHtml` (§A1).
- `unmergeTicket` (§D).
- `migrateAndDisableStatus` (§E).
- `transferDevice` / `bulkAssignDevices` / `bulkRetireDevices`
  (§H).
- `disableDistrict` / `deleteDistrict` (with attached-schools
  guard) (§H).
- `pauseSla` / `resumeSla` (§I).
- `emailSpocFromTicket` / `bulkEmailSpocs` (§I).
- `submitPortalRequestUpdate` / `submitPortalNewIssue` /
  `emailPortalLinkToContact` / `revokePortalToken` (§C).
- `reportBrokenLink` (§G).
- `sendTestEmailFromSettings` (§B + §L).

When the corresponding workstreams ship, the list above moves up
to the implemented table.
