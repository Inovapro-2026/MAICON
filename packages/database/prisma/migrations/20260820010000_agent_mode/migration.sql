-- OBJETIVO DO AGENTE (agent_mode)
-- Mesmo agente, comportamento adaptável: sales | support | sales_support.
ALTER TABLE "AISettings" ADD COLUMN "agent_mode" TEXT NOT NULL DEFAULT 'sales_support';

-- Reversível:
-- ALTER TABLE "AISettings" DROP COLUMN "agent_mode";
