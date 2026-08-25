-- SEQUÊNCIA OBRIGATÓRIA DE ABERTURA — nova sequência (4 passos) + apresentação da empresa
-- ---------------------------------------------------------------------------
-- A sequência passou de "apresentação → pergunta do nome → captura → Motor"
-- para "apresentação do agente → coleta do nome → apresentação da EMPRESA →
-- Motor Comercial". O estágio legado 'PRESENTED' deixou de existir e agora
-- equivale ao estágio 'AWAITING_NAME' (apresentado, aguardando a coleta do
-- nome). Conversas no estágio legado são realinhadas para não reiniciarem a
-- sequência nem perguntarem o nome duas vezes.

-- 1) Conversation: remapeia o estágio legado 'PRESENTED'
UPDATE "Conversation"
SET "onboarding_stage" = 'AWAITING_NAME'
WHERE "onboarding_stage" = 'PRESENTED';

-- 2) ConversationMemory: mesmo remapeio por conversa/sessão
UPDATE "ConversationMemory"
SET "onboarding_stage" = 'AWAITING_NAME'
WHERE "onboarding_stage" = 'PRESENTED';

-- Reversível (parcial):
-- UPDATE "Conversation" SET "onboarding_stage" = 'PRESENTED' WHERE "onboarding_stage" = 'AWAITING_NAME';
-- UPDATE "ConversationMemory" SET "onboarding_stage" = 'PRESENTED' WHERE "onboarding_stage" = 'AWAITING_NAME';
