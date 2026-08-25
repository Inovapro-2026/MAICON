-- REMOÇÃO DA SEQUÊNCIA OBRIGATÓRIA DE ABERTURA
-- ---------------------------------------------------------------------------
-- A IA agora conduz a conversa inteira de forma DINÂMICA, guiada pela Descrição
-- da empresa + Base de conhecimento + memória — sem roteiro fixo de abertura
-- (apresentação → nome → empresa). O bug que motivou a sequência era a repetição
-- da descrição institucional; a solução correta é remover o script hardcoded
-- que competia com a Descrição configurada, não reforçá-lo.
--
-- Colunas/estado removidos:
--   1) Conversation.onboarding_stage        (estado da sequência na conversa)
--   2) ConversationMemory.onboarding_stage  (estado persistido por conversa/sessão)
--   3) AISettings.onboarding_config         (configuração da camada TENANT)

-- 1) Conversation
ALTER TABLE "Conversation" DROP COLUMN "onboarding_stage";

-- 2) ConversationMemory
ALTER TABLE "ConversationMemory" DROP COLUMN "onboarding_stage";

-- 3) AISettings
ALTER TABLE "AISettings" DROP COLUMN "onboarding_config";
