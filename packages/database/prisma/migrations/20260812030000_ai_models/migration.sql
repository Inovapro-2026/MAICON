-- ============================================================================
-- SAVYRON — FASE 5 (IA): AIAgent, AISettings, AIKnowledge
-- Incremental e reversível; nenhuma tabela existente é apagada.
-- ============================================================================
CREATE TYPE "AITone" AS ENUM ('PROFESSIONAL', 'FRIENDLY', 'CASUAL', 'RELAXED', 'PREMIUM', 'CONSULTATIVE', 'TECHNICAL');
CREATE TYPE "AIKnowledgeCategory" AS ENUM ('PRODUCTS', 'SERVICES', 'PRICES', 'HOURS', 'POLICIES', 'FAQ', 'ADDRESS', 'PAYMENT', 'INTERNAL_RULES');

CREATE TABLE "AIAgent" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AISettings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "tone" "AITone" NOT NULL DEFAULT 'FRIENDLY',
    "behaviors" JSONB NOT NULL DEFAULT '{}',
    "message_config" JSONB NOT NULL DEFAULT '{}',
    "custom_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AISettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIKnowledge" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "AIKnowledgeCategory" NOT NULL DEFAULT 'FAQ',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AIAgent_business_id_idx" ON "AIAgent"("business_id");
CREATE INDEX "AIAgent_business_id_active_idx" ON "AIAgent"("business_id", "active");
CREATE UNIQUE INDEX "AISettings_business_id_key" ON "AISettings"("business_id");
CREATE INDEX "AISettings_business_id_idx" ON "AISettings"("business_id");
CREATE INDEX "AIKnowledge_business_id_idx" ON "AIKnowledge"("business_id");
CREATE INDEX "AIKnowledge_business_id_active_idx" ON "AIKnowledge"("business_id", "active");

ALTER TABLE "AIAgent"
    ADD CONSTRAINT "AIAgent_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AISettings"
    ADD CONSTRAINT "AISettings_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AISettings"
    ADD CONSTRAINT "AISettings_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIKnowledge"
    ADD CONSTRAINT "AIKnowledge_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reversão (down):
-- DROP TABLE "AIKnowledge"; DROP TABLE "AISettings"; DROP TABLE "AIAgent";
-- DROP TYPE "AIKnowledgeCategory"; DROP TYPE "AITone";