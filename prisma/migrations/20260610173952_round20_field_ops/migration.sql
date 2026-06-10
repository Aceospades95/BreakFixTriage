-- CreateEnum
CREATE TYPE "StopDelayReason" AS ENUM ('CONSTRUCTION', 'WEATHER', 'VEHICLE_EMERGENCY', 'PREVIOUS_STOP_DELAY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('TRANSIT', 'TOLL', 'PARKING', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AttachmentKind" ADD VALUE 'EXPENSE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailEvent" ADD VALUE 'pickup_scheduled';
ALTER TYPE "EmailEvent" ADD VALUE 'stop_delayed';
ALTER TYPE "EmailEvent" ADD VALUE 'report_operations';
ALTER TYPE "EmailEvent" ADD VALUE 'report_finance';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "expenseId" TEXT;

-- AlterTable
ALTER TABLE "RouteStop" ADD COLUMN     "delayMinutes" INTEGER,
ADD COLUMN     "delayNote" TEXT,
ADD COLUMN     "delayReason" "StopDelayReason",
ADD COLUMN     "delayedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StopDevice" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedByUserId" TEXT;

-- CreateTable
CREATE TABLE "TeamNote" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "TeamNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamNoteAck" (
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamNoteAck_pkey" PRIMARY KEY ("noteId","userId")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "techUserId" TEXT NOT NULL,
    "kind" "ExpenseKind" NOT NULL DEFAULT 'TRANSIT',
    "status" "ExpenseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "amountCents" INTEGER NOT NULL,
    "incurredOn" DATE NOT NULL,
    "description" TEXT,
    "routeId" TEXT,
    "ticketId" TEXT,
    "schoolId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamNote_active_idx" ON "TeamNote"("active");

-- CreateIndex
CREATE INDEX "TeamNoteAck_userId_idx" ON "TeamNoteAck"("userId");

-- CreateIndex
CREATE INDEX "Expense_techUserId_incurredOn_idx" ON "Expense"("techUserId", "incurredOn");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_incurredOn_idx" ON "Expense"("incurredOn");

-- CreateIndex
CREATE INDEX "Attachment_expenseId_idx" ON "Attachment"("expenseId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drift repair: the EmailLog.ticketId -> Ticket FK was declared in
-- schema.prisma but never landed in a migration, and deployed
-- databases accumulated orphaned rows (logs whose ticket was later
-- deleted). The relation's declared behavior is ON DELETE SET NULL,
-- so null the orphans before adding the constraint.
UPDATE "EmailLog" SET "ticketId" = NULL
WHERE "ticketId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."id" = "EmailLog"."ticketId");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteAck" ADD CONSTRAINT "TeamNoteAck_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "TeamNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteAck" ADD CONSTRAINT "TeamNoteAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_techUserId_fkey" FOREIGN KEY ("techUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
