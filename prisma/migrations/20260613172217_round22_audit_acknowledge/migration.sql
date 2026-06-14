-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_severity_acknowledgedAt_idx" ON "AuditLog"("severity", "acknowledgedAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
