-- CreateEnum
CREATE TYPE "StopLineState" AS ENUM ('EXPECTED', 'VERIFIED', 'NOT_FOUND', 'REFUSED', 'EXTRA_ADDED');

-- CreateEnum
CREATE TYPE "ProofRule" AS ENUM ('NONE', 'PHOTO', 'SIGNATURE', 'PHOTO_AND_SIGNATURE');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'PARTIAL';

-- DropForeignKey
ALTER TABLE "StopDevice" DROP CONSTRAINT "StopDevice_deviceId_fkey";

-- AlterTable
ALTER TABLE "RouteStop" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "proofOverrideAt" TIMESTAMP(3),
ADD COLUMN     "proofOverrideByUserId" TEXT,
ADD COLUMN     "proofOverrideReason" TEXT,
ADD COLUMN     "proofRule" "ProofRule" NOT NULL DEFAULT 'PHOTO_AND_SIGNATURE';

-- AlterTable
ALTER TABLE "StopDevice" ADD COLUMN     "lineNote" TEXT,
ADD COLUMN     "lineState" "StopLineState" NOT NULL DEFAULT 'EXPECTED',
ALTER COLUMN "deviceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "StopDevice_lineState_idx" ON "StopDevice"("lineState");

-- AddForeignKey
ALTER TABLE "StopDevice" ADD CONSTRAINT "StopDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
