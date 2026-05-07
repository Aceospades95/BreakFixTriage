# Role × permission matrix

Generated from `src/lib/auth/rbac.ts`. Update both when permissions
or role defaults change. Used by:

- §2C read-only role 403 spec (`e2e/readonly-role-403.spec.ts`)
- §2E persona suite (`e2e/persona-*.spec.ts`)

## Roles

| Role | Display | Description |
|------|---------|-------------|
| `ADMIN` | Admin | Every permission. Cannot be overridden. |
| `OPS_MANAGER` | Ops manager | Read everything + write tickets / quotes / scheduling / email-templates |
| `DISPATCHER` | Dispatcher | Read + ticket transitions + scheduling write + route building |
| `WAREHOUSE` | Warehouse | Read + ticket transitions only |
| `TECHNICIAN` | Technician | Read + ticket transitions only |
| `DRIVER` | Driver | Read tickets + scheduling, update stops |
| `READ_ONLY` | Read only | Pure read across tickets, imports, scheduling, quotes, reports, email |

## Permissions

| Permission | Description | Default roles |
|------------|-------------|---------------|
| `tickets:read` | View ticket list / detail / kanban | every read role + ADMIN |
| `tickets:write` | Create + edit tickets, manage attachments | OPS_MANAGER, ADMIN |
| `tickets:transition` | Move ticket through state machine | OPS_MANAGER, DISPATCHER, WAREHOUSE, TECHNICIAN, ADMIN |
| `imports:run` | Run a CSV / SNOW import | OPS_MANAGER, ADMIN |
| `imports:read` | View import history | every read role + ADMIN |
| `duplicates:resolve` | Resolve a duplicate via merge / link | OPS_MANAGER, ADMIN |
| `scheduling:read` | View routes + people schedule | every read role + ADMIN + DRIVER |
| `scheduling:write` | Add or edit schedule blocks | OPS_MANAGER, DISPATCHER, ADMIN |
| `routes:build` | Create / sequence routes | OPS_MANAGER, DISPATCHER, ADMIN |
| `stops:update` | Mark a stop done / move device | OPS_MANAGER, DISPATCHER, DRIVER, ADMIN |
| `quotes:read` | View quotes + invoices | every read role + ADMIN |
| `quotes:write` | Author + send quotes | OPS_MANAGER, ADMIN |
| `users:manage` | Admin overview + user CRUD | ADMIN only |
| `districts:manage` | District + school + device + parts CRUD | ADMIN only |
| `reports:read` | Dashboards + KPIs | every read role + ADMIN |
| `email:read` | Read EmailLog rows attached to a visible ticket | every read role + ADMIN |
| `email:write` | Author email templates + view email log page | OPS_MANAGER, ADMIN |
| `email:send_test` | Send a test email | OPS_MANAGER, ADMIN |
| `email:rules_manage` | Add / disable email rules | ADMIN only |

## Read-only forbidden surface

`READ_ONLY` (Ray) holds only:
`tickets:read`, `imports:read`, `scheduling:read`, `quotes:read`,
`reports:read`, `email:read`. Every server action + API route
guarded by any other permission must reject Ray with 403.

The §2C spec walks the surface below and asserts 403 for each.

### Server actions to assert 403 against

- `tickets/createTicketFromTemplateAction` (`tickets:write`)
- `tickets/updateTicketAction` (`tickets:write`)
- `tickets/transitionTicketAction` (`tickets:transition`)
- `tickets/pickUpTicketAction` (`tickets:write`)
- `bulk/bulkAssignAction` (`tickets:transition`)
- `bulk/bulkTransitionAction` (`tickets:transition`)
- `comments/createCommentAction` (`tickets:write`)
- `attachments/addAttachmentAction` (`tickets:write`)
- `imports/runImportAction` (`imports:run`)
- `imports/cancelImportAction` (`imports:run`)
- `merge/mergeTicketsAction` (`tickets:write`)
- `duplicates/linkSnowAction` (`duplicates:resolve`)
- `duplicates/dismissSnowAction` (`duplicates:resolve`)
- `scheduling/createRouteAction` (`routes:build`)
- `scheduling/updateRouteAction` (`scheduling:write`)
- `scheduling/cancelRouteAction` (`scheduling:write`)
- `scheduling/reorderStopsAction` (`stops:update`)
- `staff-schedule/createScheduleBlockAction` (own self → allowed; other user → `scheduling:write`)
- `staff-schedule/deleteScheduleBlockAction` (same)
- `stop-devices/addStopDeviceAction` (`stops:update`)
- `stop-devices/removeStopDeviceAction` (`stops:update`)
- `quotes/createQuoteAction` (`quotes:write`)
- `quotes/sendQuoteAction` (`quotes:write`)
- `rma/createRmaAction` (`tickets:write`)
- `parts/createPartAction` (`districts:manage`)
- `parts/updatePartAction` (`districts:manage`)
- `parts/deletePartAction` (`districts:manage`)
- `admin/createUserAction` (`users:manage`)
- `admin/disableUserAction` (`users:manage`)
- `admin/setUserPasswordAction` (`users:manage`)
- `2fa/resetUserTotpAction` (`users:manage`)
- `2fa/revokeAllUserSessionsAction` (`users:manage`)
- `permissions/saveOverridesAction` (`users:manage`)
- `settings/saveAppSettingAction` (`users:manage`)
- `statuses/saveStatusConfigAction` (`users:manage`)
- `statuses/resetStatusConfigAction` (`users:manage`)
- `holidays/upsertHolidayAction` (`users:manage`)
- `holidays/deleteHolidayAction` (`users:manage`)
- `holidays/seedFederalHolidaysAction` (`users:manage`)
- `email-admin/createTemplateAction` (`email:write`)
- `email-admin/updateTemplateAction` (`email:write`)
- `email-admin/deleteTemplateAction` (`email:write`)
- `email-admin/upsertRuleAction` (`email:rules_manage`)
- `email-admin/deleteRuleAction` (`email:rules_manage`)
- `tickets-email/sendTicketEmailAction` (`email:write`)
- `time/startTimerAction` (`tickets:transition`)
- `time/stopTimerAction` (`tickets:transition`)
- `warehouse/scanResolveAction` (`tickets:transition`)
- `notifications/markReadAction` (own user only — allowed)
- `notifications/markAllReadAction` (own user only — allowed)
- `templates/saveTicketTemplateAction` (`districts:manage`)

### API routes to assert 403 against

GET routes that gate writes are exempt; the list is mutation-only:

- `/api/imports/templates` (POST → `imports:run`)
- `/api/exports/users` (GET → `users:manage`)
- `/api/exports/schools` (GET → `districts:manage`)
- `/api/exports/devices` (GET → `districts:manage`)
- `/api/exports/email-log` (GET → `email:write`)
- `/api/exports/audit` (GET → `users:manage`)

`/api/exports/tickets`, `/api/exports/invoices`, `/api/exports/quotes`
return rows scoped to what the actor can read, so READ_ONLY is
allowed there.

## Persona daily workflows

Stub for `e2e/persona-*.spec.ts` — fleshed out in `docs/personas.md`.
