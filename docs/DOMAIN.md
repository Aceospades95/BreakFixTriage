# BreakFix Triage — Domain Model

This document describes the business entities and the ticket lifecycle state
machine. It is the canonical reference for what each entity *means*, not just
how it is stored.

## Glossary

- **Ticket** — A unit of work traced back to a ServiceNow incident. A ticket
  is the operational "case" that moves through the lifecycle.
- **Device** — A physical, serial-numbered asset (Chromebook, iPad, printer,
  etc.). A ticket always refers to zero or one devices; a device may accrue
  many tickets over time.
- **Job** — A scheduled piece of physical work at a location (pickup,
  delivery, on-site repair). One ticket may produce many jobs.
- **Route** — An ordered group of jobs assigned to a single employee on a
  single day.
- **District / School** — Org hierarchy. Schools belong to districts.
  Designed to scale beyond the Bronx.
- **Quote** — A commercial artifact for out-of-warranty repairs. Has its own
  sub-state (drafted, sent, approved, declined, expired).
- **AuditLog** — Append-only record of meaningful changes.

## Core entities

### Identity & org

| Entity      | Key fields                                                                   |
| ----------- | ---------------------------------------------------------------------------- |
| `User`      | id, email, name, passwordHash?, role, districtIds[], active                  |
| `District`  | id, name, code, region, active                                               |
| `School`    | id, districtId, name, code (DBN), addressId, mainContactId, notes            |
| `Address`   | id, line1, line2, city, state, postalCode, latitude, longitude               |
| `Contact`   | id, schoolId, name, title, email, phone, isPrimary                           |

### Assets & work

| Entity         | Key fields                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `DeviceModel`  | id, manufacturer, modelName, formFactor, warrantyMonths                                                 |
| `Device`       | id, serialNumber (unique), assetTag?, modelId, ownerSchoolId, purchaseDate?, warrantyExpires?          |
| `Ticket`       | id, incidentNumber (unique), serviceNowSysId?, deviceId?, schoolId, reportedAt, state, substate?, …    |
| `TicketEvent`  | id, ticketId, fromState, toState, actorUserId?, reason, payload (JSON), createdAt                     |

### Import pipeline

| Entity              | Key fields                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `ImportBatch`       | id, filename, uploadedByUserId, source (SN_CSV, SN_XLSX, MANUAL), status, stats (JSON), createdAt    |
| `ImportRow`         | id, batchId, rowNumber, raw (JSON), normalized (JSON), status, errors[], resultingTicketId?          |
| `DuplicateConflict` | id, batchId?, kind (INCIDENT, SERIAL), leftTicketId, rightTicketId, resolution?, resolvedByUserId?    |

### Scheduling & dispatch

| Entity          | Key fields                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Job`           | id, type (PICKUP, DELIVERY, ONSITE_REPAIR, OTHER), ticketIds[], schoolId, status, windowStart?, windowEnd?, notes |
| `Route`         | id, date, assigneeUserId, vehicleRef?, status, optimizedAt?, optimizerName                                         |
| `RouteStop`     | id, routeId, jobId, sequence, arrivalEstimate?, status                                                             |

### Commercial

| Entity           | Key fields                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `Quote`          | id, ticketId, status, amountCents?, diagnosticOnly, holdUntil?, sentAt?, respondedAt?, notes           |
| `QuoteActivity`  | id, quoteId, kind, actorUserId?, payload (JSON), createdAt                                              |
| `PurchaseOrder`  | id, quoteId, poNumber, issuedAt, amountCents, invoiceRequired, invoicedAt?                              |

### Ops

| Entity          | Key fields                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `AuditLog`      | id, actorUserId?, entityType, entityId, action, before (JSON), after (JSON), createdAt                  |
| `Notification`  | id, kind, ticketId?, quoteId?, recipientEmail, subject, body, status, sentAt?, transport, error?       |

## Ticket lifecycle state machine

States are explicit. Transitions are validated by `src/lib/workflow/state-machine.ts`.
Every transition produces a `TicketEvent` row.

### States

| State                 | Meaning                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `IMPORTED`            | Row created from a ServiceNow import but not yet triaged.                            |
| `TRIAGE`              | Ticket is being reviewed and routed to the correct queue.                            |
| `AWAITING_PICKUP`     | Confirmed we need to pick the device up from a school.                               |
| `PICKUP_SCHEDULED`    | A `Job` of type `PICKUP` has been planned/assigned.                                  |
| `IN_WAREHOUSE`        | Device has been received at the warehouse and logged in.                             |
| `DIAGNOSIS`           | Tech is identifying the problem.                                                     |
| `AWAITING_PARTS`      | Diagnosis complete, parts needed but not yet ordered.                                |
| `PARTS_ORDERED`       | Parts ordered, waiting to arrive.                                                    |
| `IN_REPAIR`           | Technician is actively repairing.                                                    |
| `REPAIR_COMPLETED`    | Device repaired, ready to be scheduled for delivery back to school.                  |
| `AWAITING_ONSITE`     | Repair requires an on-site visit (printers, reconnects, non-portable devices).       |
| `ONSITE_IN_PROGRESS`  | Technician is on-site working on the device.                                         |
| `QUOTE_REQUIRED`      | Out-of-warranty: a quote needs to be prepared.                                       |
| `QUOTE_SENT`          | Quote sent to the school/district, awaiting response.                                |
| `QUOTE_APPROVED`      | Quote approved, repair can proceed.                                                  |
| `QUOTE_DECLINED`      | Quote declined, proceed to closure or return.                                        |
| `QUOTE_NO_RESPONSE`   | Hold window elapsed with no response.                                                |
| `MANUFACTURER_RMA`    | Device was sent out to the manufacturer.                                             |
| `OUT_OF_SCOPE`        | Work falls outside contractual scope; close with communication.                      |
| `PENDING_DELIVERY`    | Ready to go back to the school, not yet scheduled.                                   |
| `DELIVERY_SCHEDULED`  | A `Job` of type `DELIVERY` has been planned/assigned.                                |
| `RETURNED`            | Device delivered back to school.                                                     |
| `INVOICE_REQUIRED`    | Closure is blocked on an invoice.                                                    |
| `CLOSED`              | Terminal state. Ticket is done.                                                      |
| `REOPENED`            | Ticket previously closed but came back (device failed again, new related incident).  |
| `ON_HOLD`             | Temporary pause (escalation, external dependency). Must record reason.               |

### Allowed transitions (summary)

```
IMPORTED ─► TRIAGE
TRIAGE   ─► { AWAITING_PICKUP, AWAITING_ONSITE, OUT_OF_SCOPE, CLOSED, ON_HOLD }

AWAITING_PICKUP      ─► PICKUP_SCHEDULED
PICKUP_SCHEDULED     ─► IN_WAREHOUSE
IN_WAREHOUSE         ─► DIAGNOSIS

DIAGNOSIS ─► { IN_REPAIR, AWAITING_PARTS, QUOTE_REQUIRED, MANUFACTURER_RMA, OUT_OF_SCOPE }
AWAITING_PARTS ─► PARTS_ORDERED
PARTS_ORDERED  ─► IN_REPAIR
IN_REPAIR      ─► REPAIR_COMPLETED
REPAIR_COMPLETED ─► PENDING_DELIVERY

AWAITING_ONSITE      ─► ONSITE_IN_PROGRESS
ONSITE_IN_PROGRESS   ─► { REPAIR_COMPLETED, AWAITING_PARTS, QUOTE_REQUIRED }

QUOTE_REQUIRED      ─► QUOTE_SENT
QUOTE_SENT          ─► { QUOTE_APPROVED, QUOTE_DECLINED, QUOTE_NO_RESPONSE }
QUOTE_APPROVED      ─► IN_REPAIR
{ QUOTE_DECLINED, QUOTE_NO_RESPONSE } ─► { PENDING_DELIVERY, OUT_OF_SCOPE }

PENDING_DELIVERY ─► DELIVERY_SCHEDULED ─► RETURNED
RETURNED         ─► { INVOICE_REQUIRED, CLOSED }
INVOICE_REQUIRED ─► CLOSED

CLOSED ─► REOPENED
REOPENED ─► TRIAGE

(any non-terminal) ─► ON_HOLD ─► (previous non-terminal state, recorded)
```

Guards:

- You cannot `SCHEDULE` a pickup/delivery without an associated `Job` row.
- You cannot move to `IN_WAREHOUSE` without a warehouse intake actor.
- You cannot close a ticket with `invoiceRequired = true` unless an invoice
  was attached or an operations manager overrides with a reason.
- Quote transitions require a `Quote` record in a compatible state.

## Business rules codified in `src/lib/workflow`

1. **State transitions** only via `transitionTicket(ticketId, toState, actor, reason)`.
2. **Every transition** writes a `TicketEvent` and an `AuditLog` row.
3. **ON_HOLD** stores the prior state in `TicketEvent.payload.resumeState`.
4. **REOPENED** is only valid from `CLOSED` and creates a fresh lifecycle
   cycle while preserving full history.
5. **Duplicate incidents** never silently overwrite; they enter the conflict
   queue.
6. **Serial-number matches** on a CLOSED ticket create a `REOPENED` event by
   default, configurable per-district.
