-- SEQUÊNCIA OBRIGATÓRIA DE ABERTURA (exceção do tenant SAVYRON) + BASE DE CONHECIMENTO
-- ---------------------------------------------------------------------------
-- 1) `Conversation.onboarding_stage`: estado da sequência obrigatória de
--    abertura (apresentação → nome → captura → Motor Comercial). Configurável
--    por tenant (AISettings.onboarding_config); tenants sem a sequência ficam
--    em IN_CONVERSATION (Motor Comercial dinâmico, camada SYSTEM imutável).
-- 2) `ConversationMemory.onboarding_stage`: mesmo estado persistido por
--    conversa/sessão (playground) para continuar entre turnos.
-- 3) `AISettings.onboarding_config`: configuração da camada TENANT.

-- 1) Conversation: estado da sequência de abertura
ALTER TABLE "Conversation" ADD COLUMN "onboarding_stage" TEXT NOT NULL DEFAULT 'NOT_STARTED';

-- 2) ConversationMemory: estado da sequência por conversa/sessão
ALTER TABLE "ConversationMemory" ADD COLUMN "onboarding_stage" TEXT NOT NULL DEFAULT 'NOT_STARTED';

-- 3) AISettings: configuração da sequência por tenant (camada TENANT)
ALTER TABLE "AISettings" ADD COLUMN "onboarding_config" JSONB NOT NULL DEFAULT '{}';

-- Reversível (parcial):
-- ALTER TABLE "AISettings" DROP COLUMN "onboarding_config";
-- ALTER TABLE "ConversationMemory" DROP COLUMN "onboarding_stage";
-- ALTER TABLE "Conversation" DROP COLUMN "onboarding_stage";
