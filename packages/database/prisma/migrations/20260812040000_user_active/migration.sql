-- ============================================================================
-- SAVYRON — FASE 3.1 (Admin harden): User.active (desativar/reativar conta)
-- Incremental e reversível; apenas coluna nova com default, sem perda de dados.
-- ============================================================================
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Reversão (down):
-- ALTER TABLE "User" DROP COLUMN "active";