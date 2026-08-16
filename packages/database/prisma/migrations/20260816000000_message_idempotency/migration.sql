-- IDEMPOTÊNCIA DE MENSAGENS (bug de duplicação)
-- ---------------------------------------------------------------
-- Barreira durável no banco: um mesmo message_id do WhatsApp (external_id)
-- só pode ser processado UMA vez, por empresa.

-- 1) Mensagens RECEBIDAS: um external_id por empresa, apenas IN.
CREATE UNIQUE INDEX "message_in_external_unique"
  ON "Message" ("business_id", "external_id")
  WHERE "direction" = 'IN' AND "external_id" IS NOT NULL;

-- 2) Respostas geradas pela IA: chave derivada do message_id recebido
--    (external_id = 'reply:' || <message_id recebido>), apenas OUT.
CREATE UNIQUE INDEX "message_out_ai_reply_unique"
  ON "Message" ("business_id", "external_id")
  WHERE "direction" = 'OUT' AND "external_id" IS NOT NULL AND "external_id" LIKE 'reply:%';

-- Reversível:
-- DROP INDEX "message_in_external_unique";
-- DROP INDEX "message_out_ai_reply_unique";