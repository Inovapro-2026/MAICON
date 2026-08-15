-- ============================================================================
-- SAVYRON — FASE 4 (MEU NEGÓCIO)
-- Expande BusinessSettings com campos genéricos de configuração da empresa.
-- Incremental e reversível; nenhuma tabela existente é apagada.
-- ============================================================================
ALTER TABLE "BusinessSettings" ADD COLUMN "address" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "website" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "instagram" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "opening_hours" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE "BusinessSettings" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "BusinessSettings" ADD COLUMN "additional_info" TEXT;