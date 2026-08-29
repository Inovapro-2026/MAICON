-- EXTRAÇÃO DE CONTATOS DE GRUPOS WHATSAPP (aba WhatsApp da Prospecção)
-- 1. Nova origem de lead (LeadSource.WHATSAPP_GROUP)
-- 2. WhatsAppGroupExtraction: orquestra uma extração (estado + contadores).
-- 3. WhatsAppGroupSource: um grupo do WhatsApp incluído numa extração (auditável).
-- 4. WhatsAppGroupLead: vínculo grupo <-> lead (many-to-many normalizado).

ALTER TYPE "LeadSource" ADD VALUE 'WHATSAPP_GROUP';

CREATE TYPE "WhatsAppGroupExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "WhatsAppGroupExtraction" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "status" "WhatsAppGroupExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "group_ids" TEXT[],
    "remove_duplicates" BOOLEAN NOT NULL DEFAULT true,
    "ignore_own_contact" BOOLEAN NOT NULL DEFAULT true,
    "exclude_admins" BOOLEAN NOT NULL DEFAULT false,
    "auto_enrich" BOOLEAN NOT NULL DEFAULT false,
    "destination" TEXT NOT NULL DEFAULT 'leads',
    "found_count" INTEGER NOT NULL DEFAULT 0,
    "unique_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "phone_count" INTEGER NOT NULL DEFAULT 0,
    "enriched_count" INTEGER NOT NULL DEFAULT 0,
    "qualified_count" INTEGER NOT NULL DEFAULT 0,
    "campaign_id" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppGroupExtraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppGroupSource" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "extraction_id" TEXT,
    "group_name" TEXT NOT NULL,
    "group_identifier" TEXT NOT NULL,
    "participant_count" INTEGER NOT NULL DEFAULT 0,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppGroupSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppGroupLead" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppGroupLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppGroupExtraction_business_id_idx" ON "WhatsAppGroupExtraction"("business_id");
CREATE INDEX "WhatsAppGroupExtraction_business_id_created_at_idx" ON "WhatsAppGroupExtraction"("business_id", "created_at");

CREATE INDEX "WhatsAppGroupSource_business_id_idx" ON "WhatsAppGroupSource"("business_id");
CREATE INDEX "WhatsAppGroupSource_extraction_id_idx" ON "WhatsAppGroupSource"("extraction_id");
CREATE INDEX "WhatsAppGroupSource_group_identifier_idx" ON "WhatsAppGroupSource"("group_identifier");

CREATE UNIQUE INDEX "WhatsAppGroupSource_extraction_id_group_identifier_key" ON "WhatsAppGroupSource"("extraction_id", "group_identifier");

CREATE UNIQUE INDEX "WhatsAppGroupLead_source_id_lead_id_key" ON "WhatsAppGroupLead"("source_id", "lead_id");
CREATE INDEX "WhatsAppGroupLead_lead_id_idx" ON "WhatsAppGroupLead"("lead_id");
CREATE INDEX "WhatsAppGroupLead_business_id_idx" ON "WhatsAppGroupLead"("business_id");

ALTER TABLE "WhatsAppGroupExtraction" ADD CONSTRAINT "WhatsAppGroupExtraction_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppGroupExtraction" ADD CONSTRAINT "WhatsAppGroupExtraction_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppGroupSource" ADD CONSTRAINT "WhatsAppGroupSource_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppGroupSource" ADD CONSTRAINT "WhatsAppGroupSource_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "WhatsAppGroupExtraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppGroupLead" ADD CONSTRAINT "WhatsAppGroupLead_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppGroupLead" ADD CONSTRAINT "WhatsAppGroupLead_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "WhatsAppGroupSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppGroupLead" ADD CONSTRAINT "WhatsAppGroupLead_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reversível (drop na ordem inversa das dependências):
-- DROP TABLE "WhatsAppGroupLead"; DROP TABLE "WhatsAppGroupSource"; DROP TABLE "WhatsAppGroupExtraction";
-- DROP TYPE "WhatsAppGroupExtractionStatus";
-- ALTER TYPE "LeadSource" [re-adoção de WHATSAPP_GROUP requer recriação do tipo].