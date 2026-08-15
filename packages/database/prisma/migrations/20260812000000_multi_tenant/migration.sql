-- ============================================================================
-- SAVYRON — Migração MULTI-TENANT (FASE 2)
-- Incremental e reversível. Preserva os dados existentes, vinculando-os à
-- empresa padrão "SAVYRON".
--
-- Estratégia:
--   1) Cria enums e tabelas novas (Business, BusinessSettings, BusinessMember).
--   2) Adiciona business_id (nullable) + platform_role nas tabelas existentes.
--   3) Insere a empresa padrão e faz backfill do business_id.
--   4) Aplica NOT NULL + FKs + índices compostos.
--   5) Converte UNIQUE globais em UNIQUE compostos (escopo por empresa).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------
CREATE TYPE "BusinessStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "BusinessRole" AS ENUM ('OWNER', 'BUSINESS_ADMIN', 'MANAGER', 'AGENT');
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'PLATFORM_ADMIN', 'PLATFORM_STAFF');

-- ---------------------------------------------------------------------------
-- 2. TABELAS NOVAS
-- ---------------------------------------------------------------------------
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "BusinessStatus" NOT NULL DEFAULT 'TRIAL',
    "legal_name" TEXT,
    "trade_name" TEXT,
    "cnpj" TEXT,
    "segment" TEXT,
    "description" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessSettings" (
    "business_id" TEXT NOT NULL,
    "whatsapp_daily_limit" INTEGER NOT NULL DEFAULT 30,
    "email_daily_limit" INTEGER NOT NULL DEFAULT 100,
    "interval_seconds" INTEGER NOT NULL DEFAULT 7200,
    "test_mode_max_leads" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("business_id")
);

CREATE TABLE "BusinessMember" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'AGENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");
CREATE UNIQUE INDEX "BusinessMember_business_id_user_id_key" ON "BusinessMember"("business_id", "user_id");
CREATE INDEX "BusinessMember_user_id_idx" ON "BusinessMember"("user_id");
CREATE INDEX "BusinessMember_business_id_idx" ON "BusinessMember"("business_id");
CREATE INDEX "Business_status_idx" ON "Business"("status");

ALTER TABLE "BusinessSettings"
    ADD CONSTRAINT "BusinessSettings_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessMember"
    ADD CONSTRAINT "BusinessMember_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessMember"
    ADD CONSTRAINT "BusinessMember_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. USER — papel de plataforma
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN "platform_role" "PlatformRole" NOT NULL DEFAULT 'NONE';

-- ---------------------------------------------------------------------------
-- 4. COLUNAS business_id (nullable por enquanto)
-- ---------------------------------------------------------------------------
ALTER TABLE "Lead"          ADD COLUMN "business_id" TEXT;
ALTER TABLE "LeadImport"    ADD COLUMN "business_id" TEXT;
ALTER TABLE "Campaign"      ADD COLUMN "business_id" TEXT;
ALTER TABLE "CampaignLead"  ADD COLUMN "business_id" TEXT;
ALTER TABLE "Message"       ADD COLUMN "business_id" TEXT;
ALTER TABLE "Conversation"  ADD COLUMN "business_id" TEXT;
ALTER TABLE "AIGeneration"  ADD COLUMN "business_id" TEXT;
ALTER TABLE "OptOut"        ADD COLUMN "business_id" TEXT;
ALTER TABLE "DeliveryEvent" ADD COLUMN "business_id" TEXT;

-- ---------------------------------------------------------------------------
-- 5. EMPRESA PADRÃO + BACKFILL
-- ---------------------------------------------------------------------------
INSERT INTO "Business" ("id", "name", "slug", "status", "created_at", "updated_at")
VALUES (
    'cin_default_agendacorte',
    'SAVYRON',
    'agendacorte',
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

INSERT INTO "BusinessSettings" ("business_id", "whatsapp_daily_limit", "email_daily_limit", "interval_seconds", "test_mode_max_leads", "updated_at", "created_at")
VALUES (
    'cin_default_agendacorte',
    COALESCE((SELECT CAST(value AS INTEGER) FROM "Setting" WHERE key = 'default_whatsapp_daily_limit'), 30),
    COALESCE((SELECT CAST(value AS INTEGER) FROM "Setting" WHERE key = 'default_email_daily_limit'), 100),
    COALESCE((SELECT CAST(value AS INTEGER) FROM "Setting" WHERE key = 'default_interval_seconds'), 7200),
    COALESCE((SELECT CAST(value AS INTEGER) FROM "Setting" WHERE key = 'test_mode'), 5),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Usuários existentes viram membros OWNER da empresa padrão
INSERT INTO "BusinessMember" ("id", "business_id", "user_id", "role", "created_at")
SELECT 'bzm_' || "User"."id", 'cin_default_agendacorte', "User"."id", 'OWNER', CURRENT_TIMESTAMP
FROM "User";

-- Backfill
UPDATE "Lead"          SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "LeadImport"    SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "Campaign"      SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "CampaignLead"  SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "Message"       SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "Conversation"  SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "AIGeneration"  SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "OptOut"        SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;
UPDATE "DeliveryEvent" SET "business_id" = 'cin_default_agendacorte' WHERE "business_id" IS NULL;

-- ---------------------------------------------------------------------------
-- 6. NOT NULL + FKs
-- ---------------------------------------------------------------------------
ALTER TABLE "Lead"          ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "LeadImport"    ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "Campaign"      ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "CampaignLead"  ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "Message"       ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "Conversation"  ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "AIGeneration"  ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "OptOut"        ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "DeliveryEvent" ALTER COLUMN "business_id" SET NOT NULL;

ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadImport"
    ADD CONSTRAINT "LeadImport_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignLead"
    ADD CONSTRAINT "CampaignLead_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message"
    ADD CONSTRAINT "Message_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIGeneration"
    ADD CONSTRAINT "AIGeneration_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OptOut"
    ADD CONSTRAINT "OptOut_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent"
    ADD CONSTRAINT "DeliveryEvent_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. ÍNDICES COMPOSTOS POR EMPRESA
-- ---------------------------------------------------------------------------
CREATE INDEX "Lead_business_id_idx"            ON "Lead"("business_id");
CREATE INDEX "Lead_business_id_created_at_idx" ON "Lead"("business_id", "created_at");
CREATE INDEX "Lead_business_id_status_idx"     ON "Lead"("business_id", "status");
CREATE INDEX "LeadImport_business_id_idx"      ON "LeadImport"("business_id");
CREATE INDEX "LeadImport_business_id_created_at_idx" ON "LeadImport"("business_id", "created_at");
CREATE INDEX "Campaign_business_id_idx"        ON "Campaign"("business_id");
CREATE INDEX "Campaign_business_id_status_idx" ON "Campaign"("business_id", "status");
CREATE INDEX "Campaign_business_id_created_at_idx" ON "Campaign"("business_id", "created_at");
CREATE INDEX "CampaignLead_business_id_idx"    ON "CampaignLead"("business_id");
CREATE INDEX "Message_business_id_created_at_idx" ON "Message"("business_id", "created_at");
CREATE INDEX "Conversation_business_id_last_message_at_idx" ON "Conversation"("business_id", "last_message_at");
CREATE INDEX "AIGeneration_business_id_created_at_idx" ON "AIGeneration"("business_id", "created_at");
CREATE INDEX "OptOut_business_id_idx"          ON "OptOut"("business_id");
CREATE INDEX "DeliveryEvent_business_id_created_at_idx" ON "DeliveryEvent"("business_id", "created_at");

-- ---------------------------------------------------------------------------
-- 8. UNIQUE GLOBAIS → UNIQUE COMPOSTOS (escopo por empresa)
-- ---------------------------------------------------------------------------

-- Lead: remove uniques globais (phone + fingerprints) e cria compostos.
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_phone_key";
DROP INDEX IF EXISTS "Lead_phone_key";
DROP INDEX IF EXISTS "Lead_fingerprint_phone_key";
DROP INDEX IF EXISTS "Lead_fingerprint_email_key";
DROP INDEX IF EXISTS "Lead_fingerprint_extid_key";

CREATE UNIQUE INDEX "Lead_business_id_fingerprint_phone_key" ON "Lead"("business_id", "fingerprint_phone");
CREATE UNIQUE INDEX "Lead_business_id_fingerprint_email_key" ON "Lead"("business_id", "fingerprint_email");
CREATE UNIQUE INDEX "Lead_business_id_fingerprint_extid_key" ON "Lead"("business_id", "fingerprint_extid");

-- Conversation: lead_id global → (business_id, lead_id).
DROP INDEX IF EXISTS "Conversation_lead_id_key";
CREATE UNIQUE INDEX "Conversation_business_id_lead_id_key" ON "Conversation"("business_id", "lead_id");

-- CampaignLead: (campaign_id, lead_id) → (business_id, campaign_id, lead_id).
DROP INDEX IF EXISTS "CampaignLead_campaign_id_lead_id_key";
CREATE UNIQUE INDEX "CampaignLead_business_id_campaign_id_lead_id_key" ON "CampaignLead"("business_id", "campaign_id", "lead_id");
