-- ESTENDE o enum AIKnowledgeCategory com as novas categorias comerciais.
-- Postgres exige UM ADD VALUE por statement. Os valores antigos são preservados.
ALTER TYPE "AIKnowledgeCategory" ADD VALUE IF NOT EXISTS 'PLANS';
ALTER TYPE "AIKnowledgeCategory" ADD VALUE IF NOT EXISTS 'PROMOTIONS';
ALTER TYPE "AIKnowledgeCategory" ADD VALUE IF NOT EXISTS 'DAYS';
ALTER TYPE "AIKnowledgeCategory" ADD VALUE IF NOT EXISTS 'BENEFITS';
ALTER TYPE "AIKnowledgeCategory" ADD VALUE IF NOT EXISTS 'COMMERCIAL_RULES';
ALTER TYPE "AIKnowledgeCategory" ADD VALUE IF NOT EXISTS 'LINKS';
