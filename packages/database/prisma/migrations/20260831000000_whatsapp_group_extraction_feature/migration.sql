-- ============================================================================
-- SAVYRON — MIGRAÇÃO: FEATURE "whatsapp_group_extraction" POR PLANO
-- Extração de contatos de grupos do WhatsApp fica disponível APENAS no plano
-- Empresa (slug enterprise). Insere/atualiza a feature em PlanFeature para os
-- planos padrão. Reversível (deleta as linhas da feature).
-- ============================================================================

INSERT INTO "PlanFeature" ("id", "plan_id", "feature", "enabled", "limit")
SELECT gen_random_uuid(), p."id", 'whatsapp_group_extraction', (p."slug" = 'enterprise'), NULL
FROM "Plan" p
WHERE p."slug" IN ('initial', 'professional', 'enterprise')
ON CONFLICT ("plan_id", "feature") DO UPDATE SET "enabled" = EXCLUDED."enabled";

-- Reversão (down):
-- DELETE FROM "PlanFeature" WHERE "feature" = 'whatsapp_group_extraction';
