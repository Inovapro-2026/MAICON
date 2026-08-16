-- MOTOR COMERCIAL GLOBAL + ESTÁGIOS COMERCIAIS + CLIENTES (FASES B/C/D/G)
-- ---------------------------------------------------------------------------
-- 1) `ConversationStage`: estados comerciais substituem o OnboardingStage fixo.
--    A IA (dinâmica) decide o estágio em cada turno a partir da conversa.
-- 2) `Conversation.stage` backfill a partir de `onboarding_stage` (legado).
-- 3) `AIGeneration.technique_used` e `commercial_engine_version`: rastreabilidade
--    do Motor Comercial para análise futura de técnicas (conversão/resolução).
-- 4) `Conversation.commercial_engine_version` / `last_technique_used`.
-- 5) Unicidade de CLIENTE por tenant: um telefone = um lead por business_id.

-- 1) Novo enum de estágios comerciais
CREATE TYPE "ConversationStage" AS ENUM (
  'NEW',
  'QUALIFYING',
  'DISCOVERY',
  'EVALUATION',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST'
);

-- 2) Coluna de estágio comercial (default NEW para novas conversas)
ALTER TABLE "Conversation" ADD COLUMN "stage" "ConversationStage" NOT NULL DEFAULT 'NEW';

-- 3) Rastreabilidade do Motor Comercial
ALTER TABLE "AIGeneration" ADD COLUMN "technique_used" TEXT;
ALTER TABLE "AIGeneration" ADD COLUMN "commercial_engine_version" TEXT;

ALTER TABLE "Conversation" ADD COLUMN "commercial_engine_version" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "last_technique_used" TEXT;

-- 4) Backfill do estágio a partir do onboarding legado (antes de dropar a coluna):
--    NAME_CAPTURED → DISCOVERY (já em descoberta); GREETED/COMPANY_INTRODUCED →
--    QUALIFYING; NOT_STARTED/AWAITING_NAME → NEW.
UPDATE "Conversation"
SET "stage" = CASE
  WHEN "onboarding_stage" = 'NAME_CAPTURED' THEN 'DISCOVERY'::"ConversationStage"
  WHEN "onboarding_stage" IN ('GREETED', 'COMPANY_INTRODUCED') THEN 'QUALIFYING'::"ConversationStage"
  ELSE 'NEW'::"ConversationStage"
END
WHERE "onboarding_stage" IS NOT NULL;

-- 5) Remove o estágio de onboarding fixo (substituído pelo Motor Comercial)
ALTER TABLE "Conversation" DROP COLUMN "onboarding_stage";
DROP TYPE "OnboardingStage";

-- 6) Unicidade de cliente por tenant (um telefone = um cliente por empresa).
--    Índice parcial: permite múltiplos leads SEM telefone (ex.: e-mail).
CREATE UNIQUE INDEX "lead_business_phone_unique"
  ON "Lead"("business_id", "phone")
  WHERE "phone" IS NOT NULL;

-- Reversível (parcial):
-- DROP INDEX "lead_business_phone_unique";
-- ALTER TABLE "Conversation" ADD COLUMN "onboarding_stage" "OnboardingStage";
-- CREATE TYPE "OnboardingStage" AS ENUM ('NOT_STARTED','GREETED','COMPANY_INTRODUCED','AWAITING_NAME','NAME_CAPTURED');
-- ALTER TABLE "Conversation" DROP COLUMN "commercial_engine_version";
-- ALTER TABLE "Conversation" DROP COLUMN "last_technique_used";
-- ALTER TABLE "AIGeneration" DROP COLUMN "technique_used";
-- ALTER TABLE "AIGeneration" DROP COLUMN "commercial_engine_version";
-- ALTER TABLE "Conversation" DROP COLUMN "stage";
-- DROP TYPE "ConversationStage";