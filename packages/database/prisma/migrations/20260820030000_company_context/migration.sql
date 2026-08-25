-- CONTEXTO DA EMPRESA para a IA — dados factuais estruturados.
-- Visão geral (identidade, público, problemas, diferenciais, posicionamento,
-- área, objetivo, instruções). A Base de conhecimento segue sendo a fonte
-- detalhada de produtos/preços/políticas. Todos os campos são opcionais.
ALTER TABLE "BusinessSettings"
  ADD COLUMN "target_audience" TEXT,
  ADD COLUMN "problems_solved" TEXT,
  ADD COLUMN "differentials" TEXT,
  ADD COLUMN "positioning" TEXT,
  ADD COLUMN "service_area" TEXT,
  ADD COLUMN "business_objectives" TEXT,
  ADD COLUMN "additional_instructions" TEXT;

-- Reversível:
-- ALTER TABLE "BusinessSettings"
--   DROP COLUMN "additional_instructions",
--   DROP COLUMN "business_objectives",
--   DROP COLUMN "service_area",
--   DROP COLUMN "positioning",
--   DROP COLUMN "differentials",
--   DROP COLUMN "problems_solved",
--   DROP COLUMN "target_audience";
