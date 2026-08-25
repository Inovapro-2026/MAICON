-- PROSPECÇÃO MULTI-PLATAFORMA VIA APIFY
-- `ProspectionRun.sources`: fontes ativas da run (["google_maps"],
-- ["instagram"] ou ambos). Vazio = pipeline web padrão (Overpass/Firecrawl).
ALTER TABLE "ProspectionRun" ADD COLUMN "sources" JSONB;

-- Reversível:
-- ALTER TABLE "ProspectionRun" DROP COLUMN "sources";
