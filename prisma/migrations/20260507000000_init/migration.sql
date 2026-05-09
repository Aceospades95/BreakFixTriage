-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPS_MANAGER', 'DISPATCHER', 'WAREHOUSE', 'TECHNICIAN', 'DRIVER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "FormFactor" AS ENUM ('LAPTOP', 'CHROMEBOOK', 'DESKTOP', 'TABLET', 'PHONE', 'PRINTER', 'NETWORK', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketState" AS ENUM ('IMPORTED', 'TRIAGE', 'AWAITING_PICKUP', 'PICKUP_SCHEDULED', 'IN_WAREHOUSE', 'DIAGNOSIS', 'AWAITING_PARTS', 'PARTS_ORDERED', 'IN_REPAIR', 'REPAIR_COMPLETED', 'AWAITING_ONSITE', 'ONSITE_IN_PROGRESS', 'QUOTE_REQUIRED', 'QUOTE_SENT', 'QUOTE_APPROVED', 'QUOTE_DECLINED', 'QUOTE_NO_RESPONSE', 'MANUFACTURER_RMA', 'OUT_OF_SCOPE', 'PENDING_DELIVERY', 'DELIVERY_SCHEDULED', 'RETURNED', 'INVOICE_REQUIRED', 'CLOSED', 'REOPENED', 'ON_HOLD', 'PENDING_PICKUP_UNLINKED');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('IMPORTED', 'MANUAL', 'PORTAL', 'ROUTE_PICKUP');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('SN_CSV', 'SN_XLSX', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('TICKETS', 'SCHOOLS', 'DEVICES', 'USERS', 'PARTS', 'DEVICE_MODELS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'VALIDATING', 'READY', 'COMMITTING', 'COMMITTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'INVALID', 'DUPLICATE', 'READY', 'CREATED', 'UPDATED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DuplicateKind" AS ENUM ('INCIDENT', 'SERIAL');

-- CreateEnum
CREATE TYPE "DuplicateResolution" AS ENUM ('MERGE_INTO_LEFT', 'MERGE_INTO_RIGHT', 'TREAT_AS_REOPEN', 'KEEP_BOTH', 'REJECT_NEW');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PICKUP', 'DELIVERY', 'ONSITE_REPAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'NO_RESPONSE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DEVICE_SCHEDULED', 'PICKUP_SCHEDULED', 'DELIVERY_SCHEDULED', 'QUOTE_SENT', 'QUOTE_FOLLOW_UP', 'OUT_OF_SCOPE_CLOSURE', 'NO_RESPONSE_CLOSURE', 'GENERIC');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('TICKET', 'ROUTE_STOP', 'QUOTE');

-- CreateEnum
CREATE TYPE "InAppNotificationKind" AS ENUM ('TICKET_ASSIGNED', 'TICKET_MENTION', 'SLA_BREACH', 'ESCALATION', 'GENERIC');

-- CreateEnum
CREATE TYPE "PartMovementKind" AS ENUM ('RECEIVED', 'CONSUMED', 'ADJUSTMENT', 'RETURNED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "EmailRuleScope" AS ENUM ('GLOBAL', 'DISTRICT', 'SCHOOL', 'TICKET');

-- CreateEnum
CREATE TYPE "EmailEvent" AS ENUM ('ticket_created', 'ticket_assigned', 'ticket_status_changed', 'quote_sent', 'quote_approved_internal', 'delivery_scheduled', 'delivery_completed_with_receipt', 'sla_breach_warning', 'sla_breached', 'daily_digest', 'status_in_repair', 'status_parts_ordered', 'ticket_closed', 'ticket_update_to_spoc', 'quote_approved', 'pickup_completed');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('queued', 'sent', 'failed', 'bounced');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "HolidayScope" AS ENUM ('GLOBAL', 'DISTRICT');

-- CreateEnum
CREATE TYPE "PortalRequestKind" AS ENUM ('UPDATE_REQUEST', 'NEW_ISSUE');

-- CreateEnum
CREATE TYPE "StaffScheduleKind" AS ENUM ('WAREHOUSE', 'ON_ROUTE', 'PTO', 'TRAINING', 'OUT_OF_OFFICE', 'MEETING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'READ_ONLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "backupCodes" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "uaFingerprint" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistrictUser" (
    "districtId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DistrictUser_pkey" PRIMARY KEY ("districtId","userId")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "addressId" TEXT,
    "mainContactId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsAddress" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "receivesTicketEmails" BOOLEAN NOT NULL DEFAULT false,
    "receivesQuoteEmails" BOOLEAN NOT NULL DEFAULT false,
    "receivesDeliveryReceipts" BOOLEAN NOT NULL DEFAULT false,
    "ccOnAllTickets" BOOLEAN NOT NULL DEFAULT false,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceModel" (
    "id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "formFactor" "FormFactor" NOT NULL DEFAULT 'OTHER',
    "warrantyMonths" INTEGER,
    "repairNotes" TEXT,

    CONSTRAINT "DeviceModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "assetTag" TEXT,
    "modelId" TEXT,
    "ownerSchoolId" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "warrantyExpires" TIMESTAMP(3),
    "notes" TEXT,
    "macAddress" TEXT,
    "specs" JSONB,
    "firstSeenAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "retiredReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "incidentNumber" TEXT NOT NULL,
    "serviceNowSysId" TEXT,
    "deviceId" TEXT,
    "schoolId" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "state" "TicketState" NOT NULL DEFAULT 'IMPORTED',
    "substate" TEXT,
    "assignedUserId" TEXT,
    "meta" JSONB,
    "invoiceRequired" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "stateEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "TicketSource" NOT NULL DEFAULT 'IMPORTED',
    "slaPausedAt" TIMESTAMP(3),
    "slaPausedReason" TEXT,
    "slaPausedByUserId" TEXT,
    "slaWarningFiredAt" TIMESTAMP(3),
    "slaBreachFiredAt" TIMESTAMP(3),
    "mergedIntoTicketId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "mergeReason" TEXT,
    "mergedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromState" "TicketState",
    "toState" "TicketState" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "type" "ImportType" NOT NULL DEFAULT 'TICKETS',
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "stats" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resultingTicketId" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateConflict" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "kind" "DuplicateKind" NOT NULL,
    "leftTicketId" TEXT NOT NULL,
    "rightTicketId" TEXT NOT NULL,
    "notes" TEXT,
    "resolution" "DuplicateResolution",
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "schoolId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'UNSCHEDULED',
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketJob" (
    "ticketId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "TicketJob_pkey" PRIMARY KEY ("ticketId","jobId")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "vehicleRef" TEXT,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "optimizerName" TEXT,
    "optimizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "arrivalEstimate" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "arrivedLat" DOUBLE PRECISION,
    "arrivedLng" DOUBLE PRECISION,
    "arrivedAt" TIMESTAMP(3),

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StopDevice" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ticketId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "removedReason" TEXT,

    CONSTRAINT "StopDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "amountCents" INTEGER,
    "diagnosticOnly" BOOLEAN NOT NULL DEFAULT false,
    "holdUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteActivity" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "invoiceRequired" BOOLEAN NOT NULL DEFAULT false,
    "invoicedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "ticketId" TEXT,
    "quoteId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "transport" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "ticketId" TEXT,
    "routeStopId" TEXT,
    "quoteId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "kind" "InAppNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkHref" TEXT,
    "ticketId" TEXT,
    "routeId" TEXT,
    "quoteId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartMovement" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "kind" "PartMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "ticketId" TEXT,
    "userId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartUsage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturerRma" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "rmaNumber" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "trackingOut" TEXT,
    "trackingIn" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturerRma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "notes" TEXT,
    "manualEntry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRule" (
    "id" TEXT NOT NULL,
    "scope" "EmailRuleScope" NOT NULL,
    "scopeId" TEXT,
    "event" "EmailEvent" NOT NULL,
    "recipients" JSONB NOT NULL,
    "templateId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "templateId" TEXT NOT NULL,
    "ticketId" TEXT,
    "routeId" TEXT,
    "quoteId" TEXT,
    "to" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailJob" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "emailLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "scope" "HolidayScope" NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "inAppNotifications" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "digestOptIn" BOOLEAN NOT NULL DEFAULT false,
    "digestHour" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PortalRequest" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "createdTicketId" TEXT,
    "schoolId" TEXT NOT NULL,
    "kind" "PortalRequestKind" NOT NULL,
    "body" TEXT NOT NULL,
    "contactEmail" TEXT,
    "portalTokenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "kind" "StaffScheduleKind" NOT NULL,
    "note" TEXT,
    "routeId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PartCompatibility" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "UserSession_lastSeenAt_idx" ON "UserSession"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "District_code_key" ON "District"("code");

-- CreateIndex
CREATE UNIQUE INDEX "School_code_key" ON "School"("code");

-- CreateIndex
CREATE UNIQUE INDEX "School_mainContactId_key" ON "School"("mainContactId");

-- CreateIndex
CREATE INDEX "School_districtId_idx" ON "School"("districtId");

-- CreateIndex
CREATE INDEX "Contact_schoolId_idx" ON "Contact"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceModel_manufacturer_modelName_key" ON "DeviceModel"("manufacturer", "modelName");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Device_assetTag_key" ON "Device"("assetTag");

-- CreateIndex
CREATE INDEX "Device_ownerSchoolId_idx" ON "Device"("ownerSchoolId");

-- CreateIndex
CREATE INDEX "Device_macAddress_idx" ON "Device"("macAddress");

-- CreateIndex
CREATE INDEX "Device_retiredAt_idx" ON "Device"("retiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_incidentNumber_key" ON "Ticket"("incidentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_serviceNowSysId_key" ON "Ticket"("serviceNowSysId");

-- CreateIndex
CREATE INDEX "Ticket_state_idx" ON "Ticket"("state");

-- CreateIndex
CREATE INDEX "Ticket_schoolId_idx" ON "Ticket"("schoolId");

-- CreateIndex
CREATE INDEX "Ticket_deviceId_idx" ON "Ticket"("deviceId");

-- CreateIndex
CREATE INDEX "Ticket_assignedUserId_idx" ON "Ticket"("assignedUserId");

-- CreateIndex
CREATE INDEX "Ticket_stateEnteredAt_idx" ON "Ticket"("stateEnteredAt");

-- CreateIndex
CREATE INDEX "Ticket_mergedIntoTicketId_idx" ON "Ticket"("mergedIntoTicketId");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_idx" ON "TicketEvent"("ticketId");

-- CreateIndex
CREATE INDEX "TicketEvent_toState_idx" ON "TicketEvent"("toState");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_idx" ON "ImportRow"("batchId");

-- CreateIndex
CREATE INDEX "ImportRow_status_idx" ON "ImportRow"("status");

-- CreateIndex
CREATE INDEX "DuplicateConflict_kind_idx" ON "DuplicateConflict"("kind");

-- CreateIndex
CREATE INDEX "DuplicateConflict_resolvedAt_idx" ON "DuplicateConflict"("resolvedAt");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_schoolId_idx" ON "Job"("schoolId");

-- CreateIndex
CREATE INDEX "Route_date_idx" ON "Route"("date");

-- CreateIndex
CREATE INDEX "Route_assigneeUserId_date_idx" ON "Route"("assigneeUserId", "date");

-- CreateIndex
CREATE INDEX "RouteStop_routeId_idx" ON "RouteStop"("routeId");

-- CreateIndex
CREATE INDEX "RouteStop_jobId_idx" ON "RouteStop"("jobId");

-- CreateIndex
CREATE INDEX "RouteStop_arrivedAt_idx" ON "RouteStop"("arrivedAt");

-- CreateIndex
CREATE INDEX "StopDevice_stopId_idx" ON "StopDevice"("stopId");

-- CreateIndex
CREATE INDEX "StopDevice_deviceId_idx" ON "StopDevice"("deviceId");

-- CreateIndex
CREATE INDEX "StopDevice_ticketId_idx" ON "StopDevice"("ticketId");

-- CreateIndex
CREATE INDEX "StopDevice_removedAt_idx" ON "StopDevice"("removedAt");

-- CreateIndex
CREATE INDEX "Quote_ticketId_idx" ON "Quote"("ticketId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "QuoteActivity_quoteId_idx" ON "QuoteActivity"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_quoteId_key" ON "PurchaseOrder"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_kind_idx" ON "Notification"("kind");

-- CreateIndex
CREATE INDEX "Comment_ticketId_idx" ON "Comment"("ticketId");

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");

-- CreateIndex
CREATE INDEX "Attachment_ticketId_idx" ON "Attachment"("ticketId");

-- CreateIndex
CREATE INDEX "Attachment_routeStopId_idx" ON "Attachment"("routeStopId");

-- CreateIndex
CREATE INDEX "Attachment_quoteId_idx" ON "Attachment"("quoteId");

-- CreateIndex
CREATE INDEX "InAppNotification_recipientUserId_readAt_idx" ON "InAppNotification"("recipientUserId", "readAt");

-- CreateIndex
CREATE INDEX "InAppNotification_createdAt_idx" ON "InAppNotification"("createdAt");

-- CreateIndex
CREATE INDEX "InAppNotification_ticketId_idx" ON "InAppNotification"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sku_key" ON "Part"("sku");

-- CreateIndex
CREATE INDEX "Part_active_idx" ON "Part"("active");

-- CreateIndex
CREATE INDEX "Part_name_idx" ON "Part"("name");

-- CreateIndex
CREATE INDEX "PartMovement_partId_idx" ON "PartMovement"("partId");

-- CreateIndex
CREATE INDEX "PartMovement_ticketId_idx" ON "PartMovement"("ticketId");

-- CreateIndex
CREATE INDEX "PartMovement_createdAt_idx" ON "PartMovement"("createdAt");

-- CreateIndex
CREATE INDEX "PartUsage_ticketId_idx" ON "PartUsage"("ticketId");

-- CreateIndex
CREATE INDEX "PartUsage_partId_idx" ON "PartUsage"("partId");

-- CreateIndex
CREATE INDEX "ManufacturerRma_ticketId_idx" ON "ManufacturerRma"("ticketId");

-- CreateIndex
CREATE INDEX "ManufacturerRma_rmaNumber_idx" ON "ManufacturerRma"("rmaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PortalToken_token_key" ON "PortalToken"("token");

-- CreateIndex
CREATE INDEX "PortalToken_schoolId_idx" ON "PortalToken"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTemplate_name_key" ON "TicketTemplate"("name");

-- CreateIndex
CREATE INDEX "TicketTemplate_active_idx" ON "TicketTemplate"("active");

-- CreateIndex
CREATE INDEX "TimeEntry_ticketId_idx" ON "TimeEntry"("ticketId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_endedAt_idx" ON "TimeEntry"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "TimeEntry_startedAt_idx" ON "TimeEntry"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE INDEX "EmailTemplate_key_idx" ON "EmailTemplate"("key");

-- CreateIndex
CREATE INDEX "EmailRule_scope_scopeId_event_enabled_idx" ON "EmailRule"("scope", "scopeId", "event", "enabled");

-- CreateIndex
CREATE INDEX "EmailRule_event_enabled_idx" ON "EmailRule"("event", "enabled");

-- CreateIndex
CREATE INDEX "EmailLog_ticketId_idx" ON "EmailLog"("ticketId");

-- CreateIndex
CREATE INDEX "EmailLog_routeId_idx" ON "EmailLog"("routeId");

-- CreateIndex
CREATE INDEX "EmailLog_quoteId_idx" ON "EmailLog"("quoteId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailJob_status_nextRunAt_idx" ON "EmailJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "EmailJob_lockedAt_idx" ON "EmailJob"("lockedAt");

-- CreateIndex
CREATE INDEX "Holiday_date_scope_scopeId_idx" ON "Holiday"("date", "scope", "scopeId");

-- CreateIndex
CREATE INDEX "PortalRequest_schoolId_createdAt_idx" ON "PortalRequest"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalRequest_ticketId_idx" ON "PortalRequest"("ticketId");

-- CreateIndex
CREATE INDEX "PortalRequest_createdTicketId_idx" ON "PortalRequest"("createdTicketId");

-- CreateIndex
CREATE INDEX "StaffSchedule_date_idx" ON "StaffSchedule"("date");

-- CreateIndex
CREATE INDEX "StaffSchedule_userId_date_idx" ON "StaffSchedule"("userId", "date");

-- CreateIndex
CREATE INDEX "StaffSchedule_kind_idx" ON "StaffSchedule"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSchedule_userId_date_startMinute_key" ON "StaffSchedule"("userId", "date", "startMinute");

-- CreateIndex
CREATE UNIQUE INDEX "_PartCompatibility_AB_unique" ON "_PartCompatibility"("A", "B");

-- CreateIndex
CREATE INDEX "_PartCompatibility_B_index" ON "_PartCompatibility"("B");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistrictUser" ADD CONSTRAINT "DistrictUser_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistrictUser" ADD CONSTRAINT "DistrictUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_mainContactId_fkey" FOREIGN KEY ("mainContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "DeviceModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_ownerSchoolId_fkey" FOREIGN KEY ("ownerSchoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_mergedIntoTicketId_fkey" FOREIGN KEY ("mergedIntoTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_resultingTicketId_fkey" FOREIGN KEY ("resultingTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateConflict" ADD CONSTRAINT "DuplicateConflict_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateConflict" ADD CONSTRAINT "DuplicateConflict_leftTicketId_fkey" FOREIGN KEY ("leftTicketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateConflict" ADD CONSTRAINT "DuplicateConflict_rightTicketId_fkey" FOREIGN KEY ("rightTicketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateConflict" ADD CONSTRAINT "DuplicateConflict_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketJob" ADD CONSTRAINT "TicketJob_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketJob" ADD CONSTRAINT "TicketJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopDevice" ADD CONSTRAINT "StopDevice_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "RouteStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopDevice" ADD CONSTRAINT "StopDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopDevice" ADD CONSTRAINT "StopDevice_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteActivity" ADD CONSTRAINT "QuoteActivity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteActivity" ADD CONSTRAINT "QuoteActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_routeStopId_fkey" FOREIGN KEY ("routeStopId") REFERENCES "RouteStop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartMovement" ADD CONSTRAINT "PartMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartMovement" ADD CONSTRAINT "PartMovement_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartMovement" ADD CONSTRAINT "PartMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartUsage" ADD CONSTRAINT "PartUsage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartUsage" ADD CONSTRAINT "PartUsage_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerRma" ADD CONSTRAINT "ManufacturerRma_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalToken" ADD CONSTRAINT "PortalToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailRule" ADD CONSTRAINT "EmailRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EmailRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PartCompatibility" ADD CONSTRAINT "_PartCompatibility_A_fkey" FOREIGN KEY ("A") REFERENCES "DeviceModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PartCompatibility" ADD CONSTRAINT "_PartCompatibility_B_fkey" FOREIGN KEY ("B") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

