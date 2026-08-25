-- BASE DE CONHECIMENTO — EVOLUÇÃO COMPATÍVEL
-- 1) Novas categorias (plano, promoção, dias, benefícios, regras, links...) no
--    enum AIKnowledgeCategory. Os valores antigos (PRODUCTS/SERVICES/PRICES/
--    HOURS/POLICIES/FAQ/ADDRESS/PAYMENT/INTERNAL_RULES) são preservados.
-- 2) `AIKnowledge.keywords`: palavras-chave opcionais p/ melhorar a recuperação.

-- Adiciona a coluna de palavras-chave (nullable — registros antigos seguem ok).
ALTER TABLE "AIKnowledge" ADD COLUMN "keywords" TEXT;

-- Reversível:
-- ALTER TABLE "AIKnowledge" DROP COLUMN "keywords";
