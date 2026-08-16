-- Índice do estágio comercial na Conversation (alinhamento com schema.prisma).
-- O índice `(business_id, stage)` foi declarado no schema, mas ficou de fora da
-- migração 20260816020000 — adicionado aqui como migração própria.

CREATE INDEX "Conversation_business_id_stage_idx" ON "Conversation"("business_id", "stage");

-- Reversível:
-- DROP INDEX "Conversation_business_id_stage_idx";