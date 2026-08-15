-- ============================================================================
-- SAVYRON — MIGRAÇÃO DE GATEWAY: ASAAS -> STRIPE
-- Adiciona campos Stripe em Plan, Subscription e Payment.
-- Colunas ASAAS mantidas como legado (deprecated) — sem perda de dados.
-- Reversível: apenas ADD COLUMN + CREATE UNIQUE INDEX (nenhuma coluna removida).
-- ============================================================================

-- Plan: referência ao produto/preço Stripe
ALTER TABLE "Plan" ADD COLUMN "stripe_product_id" TEXT;
ALTER TABLE "Plan" ADD COLUMN "stripe_price_id" TEXT;

-- Subscription: referências Stripe
ALTER TABLE "Subscription" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "stripe_subscription_id" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "stripe_price_id" TEXT;

CREATE INDEX "Subscription_stripe_customer_id_idx" ON "Subscription"("stripe_customer_id");
CREATE INDEX "Subscription_stripe_subscription_id_idx" ON "Subscription"("stripe_subscription_id");

-- Payment: referências Stripe
ALTER TABLE "Payment" ADD COLUMN "stripe_payment_intent_id" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripe_checkout_session_id" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripe_charge_id" TEXT;

CREATE UNIQUE INDEX "Payment_stripe_payment_intent_id_key" ON "Payment"("stripe_payment_intent_id");
CREATE UNIQUE INDEX "Payment_stripe_checkout_session_id_key" ON "Payment"("stripe_checkout_session_id");

-- Reversão (down):
-- DROP INDEX "Payment_stripe_checkout_session_id_key";
-- DROP INDEX "Payment_stripe_payment_intent_id_key";
-- ALTER TABLE "Payment" DROP COLUMN "stripe_charge_id";
-- ALTER TABLE "Payment" DROP COLUMN "stripe_checkout_session_id";
-- ALTER TABLE "Payment" DROP COLUMN "stripe_payment_intent_id";
-- DROP INDEX "Subscription_stripe_subscription_id_idx";
-- DROP INDEX "Subscription_stripe_customer_id_idx";
-- ALTER TABLE "Subscription" DROP COLUMN "stripe_price_id";
-- ALTER TABLE "Subscription" DROP COLUMN "stripe_subscription_id";
-- ALTER TABLE "Subscription" DROP COLUMN "stripe_customer_id";
-- ALTER TABLE "Plan" DROP COLUMN "stripe_price_id";
-- ALTER TABLE "Plan" DROP COLUMN "stripe_product_id";