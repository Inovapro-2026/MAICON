-- ============================================================================
-- SAVYRON — REMOÇÃO COMPLETA DO GATEWAY ASAAS
-- Remove colunas ASAAS legadas de Subscription e Payment (dados históricos
-- deliberadamente perdidos — gateway atual é o Stripe).
-- Irreversível: DROP COLUMN.
-- ============================================================================

-- Payment: remove referência ASAAS
DROP INDEX IF EXISTS "Payment_asaas_payment_id_key";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "asaas_payment_id";

-- Subscription: remove referências ASAAS
DROP INDEX IF EXISTS "Subscription_asaas_subscription_id_idx";
DROP INDEX IF EXISTS "Subscription_asaas_customer_id_idx";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "asaas_subscription_id";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "asaas_customer_id";

-- Reversão (up): irreversível — os dados foram descartados.
