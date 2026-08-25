-- Conversation Learning Engine — inteligência comercial por tenant.
-- Novas tabelas isoladas por business_id + extensão da memória da conversa.

-- AlterTable: memória do lead (ConversationMemory) passa a registrar perguntas
-- já feitas (evita re-perguntar) e a última mensagem do cliente (continuidade).
ALTER TABLE "ConversationMemory" ADD COLUMN "asked_questions" JSONB;
ALTER TABLE "ConversationMemory" ADD COLUMN "last_customer_message" TEXT;

-- AlterTable: registra o próximo passo decidido em cada geração (alimenta o
-- aprendizado por tenant: qual pergunta de descoberta foi feita em cada turno).
ALTER TABLE "AIGeneration" ADD COLUMN "next_action" TEXT;

-- CreateTable: insight bruto extraído de uma conversa analisada.
CREATE TABLE "SalesConversationInsight" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "segment" TEXT,
    "acquisition_channel" TEXT,
    "stage_at_close" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'ONGOING',
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "agent_question_count" INTEGER NOT NULL DEFAULT 0,
    "customer_message_count" INTEGER NOT NULL DEFAULT 0,
    "messages_to_price" INTEGER,
    "messages_to_conversion" INTEGER,
    "last_agent_question" TEXT,
    "last_customer_message" TEXT,
    "pains" JSONB,
    "objections" JSONB,
    "needs" JSONB,
    "questions" JSONB,
    "techniques" JSONB,
    "strategy_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesConversationInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: isolamento por tenant + consultas de agregação.
CREATE UNIQUE INDEX "SalesConversationInsight_conversation_id_key" ON "SalesConversationInsight"("conversation_id");
CREATE INDEX "SalesConversationInsight_business_id_outcome_idx" ON "SalesConversationInsight"("business_id", "outcome");
CREATE INDEX "SalesConversationInsight_business_id_created_at_idx" ON "SalesConversationInsight"("business_id", "created_at");
CREATE INDEX "SalesConversationInsight_business_id_segment_idx" ON "SalesConversationInsight"("business_id", "segment");
CREATE INDEX "SalesConversationInsight_business_id_lead_id_idx" ON "SalesConversationInsight"("business_id", "lead_id");

-- CreateTable: estratégia comercial aprendida do tenant (versionada).
CREATE TABLE "CommercialStrategy" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "segment" TEXT,
    "acquisition_channel" TEXT,
    "missing_fact" TEXT,
    "recommended_next_action" TEXT NOT NULL,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "success_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "continuity_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "response_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interest_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversion_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_success_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'LEARNING',
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: isolamento por tenant + leitura de estratégias ativas.
CREATE UNIQUE INDEX "CommercialStrategy_business_id_strategy_id_version_key" ON "CommercialStrategy"("business_id", "strategy_id", "version");
CREATE INDEX "CommercialStrategy_business_id_status_idx" ON "CommercialStrategy"("business_id", "status");
CREATE INDEX "CommercialStrategy_business_id_segment_idx" ON "CommercialStrategy"("business_id", "segment");
CREATE INDEX "CommercialStrategy_business_id_recommended_next_action_idx" ON "CommercialStrategy"("business_id", "recommended_next_action");

-- AddForeignKey: integridade referencial (cascade ao deletar o tenant).
ALTER TABLE "SalesConversationInsight" ADD CONSTRAINT "SalesConversationInsight_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialStrategy" ADD CONSTRAINT "CommercialStrategy_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;