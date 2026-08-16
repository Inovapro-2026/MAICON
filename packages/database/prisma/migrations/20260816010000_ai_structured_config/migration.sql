-- Configuração estruturada da empresa + IA (FASE A)
-- ---------------------------------------------------------------
-- `AIAgent.objective`: objetivo do agente, gerado automaticamente a partir dos
-- dados da empresa (botão "Aplicar informações na IA").
-- `AISettings.last_applied_at`: timestamp da última aplicação automática.

ALTER TABLE "AIAgent" ADD COLUMN "objective" TEXT;

ALTER TABLE "AISettings" ADD COLUMN "last_applied_at" TIMESTAMP(3);

-- Reversível:
-- ALTER TABLE "AIAgent" DROP COLUMN "objective";
-- ALTER TABLE "AISettings" DROP COLUMN "last_applied_at";