-- ============================================================================
-- SAVYRON — MIGRAÇÃO: FEATURE "prospeccao_web" POR PLANO
-- Prospecção web automática fica disponível APENAS no plano Empresa (slug
-- enterprise). Insere/atualiza a feature em PlanFeature para os 3 planos
-- padrão. Reversível (deleta as linhas da feature).
-- ============================================================================

INSERT INTO "PlanFeature" ("id", "plan_id", "feature", "enabled", "limit")
SELECT gen_random_uuid(), p."id", 'prospeccao_web', (p."slug" = 'enterprise'), NULL
FROM "Plan" p
WHERE p."slug" IN ('initial', 'professional', 'enterprise')
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = EXCLUDED."enabled";

-- Reversão (down):
-- DELETE FROM "PlanFeature" WHERE "feature" = 'prospeccao_web';
