-- CreateEnum
CREATE TYPE "ProspectionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'WEB';

-- DropForeignKey
ALTER TABLE "DeliveryEvent" DROP CONSTRAINT "DeliveryEvent_business_id_fkey";

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "interval_seconds" SET DEFAULT 7200;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "address" TEXT,
ADD COLUMN     "collected_at" TIMESTAMP(3),
ADD COLUMN     "country" TEXT,
ADD COLUMN     "fingerprint_domain" TEXT,
ADD COLUMN     "fingerprint_namecity" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "lead_score" INTEGER,
ADD COLUMN     "prospection_run_id" TEXT,
ADD COLUMN     "segment" TEXT,
ADD COLUMN     "source_type" TEXT,
ADD COLUMN     "source_url" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "ProspectionRun" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "segment" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "target_quantity" INTEGER NOT NULL DEFAULT 100,
    "status" "ProspectionStatus" NOT NULL DEFAULT 'PENDING',
    "found_count" INTEGER NOT NULL DEFAULT 0,
    "saved_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "discarded_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "phone_count" INTEGER NOT NULL DEFAULT 0,
    "email_count" INTEGER NOT NULL DEFAULT 0,
    "avg_score" DOUBLE PRECISION,
    "summary" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProspectionRun_business_id_idx" ON "ProspectionRun"("business_id");

-- CreateIndex
CREATE INDEX "ProspectionRun_business_id_created_at_idx" ON "ProspectionRun"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_prospection_run_id_fkey" FOREIGN KEY ("prospection_run_id") REFERENCES "ProspectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectionRun" ADD CONSTRAINT "ProspectionRun_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectionRun" ADD CONSTRAINT "ProspectionRun_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Plan_feature_plan_id_idx" RENAME TO "PlanFeature_plan_id_idx";

