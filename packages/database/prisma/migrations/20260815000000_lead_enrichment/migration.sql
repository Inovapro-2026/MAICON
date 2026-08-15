-- ============================================================================
-- SAVYRON — MIGRAÇÃO: ENRIQUECIMENTO DE LEADS (Scrapy)
-- Adiciona colunas facebook/whatsapp em Lead para armazenar contatos extraídos
-- pelo serviço prospector-scrapy. Reversível: apenas ADD COLUMN.
-- ============================================================================

ALTER TABLE "Lead" ADD COLUMN "facebook" TEXT;
ALTER TABLE "Lead" ADD COLUMN "whatsapp" TEXT;

-- Reversão (down):
-- ALTER TABLE "Lead" DROP COLUMN "whatsapp";
-- ALTER TABLE "Lead" DROP COLUMN "facebook";
