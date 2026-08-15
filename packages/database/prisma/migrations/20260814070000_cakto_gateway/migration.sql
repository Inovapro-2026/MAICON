-- ============================================================================
-- SAVYRON — MIGRAÇÃO DE GATEWAY: STRIPE -> CAKTO (PIX recorrente)
-- Adiciona campos Cakto em Plan, Subscription e Payment.
-- Campos Stripe mantidos em paralelo (sem perda de dados; assinaturas Stripe
-- ativas seguem no Stripe até o fim do ciclo).
-- Reversível: apenas ADD COLUMN + CREATE UNIQUE INDEX (nenhuma coluna removida).
-- ============================================================================

-- Plan: referência ao produto/oferta Cakto
ALTER TABLE "Plan" ADD COLUMN "cakto_product_id" TEXT;
ALTER TABLE "Plan" ADD COLUMN "cakto_offer_id" TEXT;

-- Subscription: referências Cakto
ALTER TABLE "Subscription" ADD COLUMN "cakto_subscription_id" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "cakto_product_id" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "cakto_offer_id" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "cakto_checkout_url" TEXT;

CREATE INDEX "Subscription_cakto_subscription_id_idx" ON "Subscription"("cakto_subscription_id");

-- Payment: referências Cakto
ALTER TABLE "Payment" ADD COLUMN "cakto_order_id" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cakto_ref_id" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cakto_event" TEXT;

CREATE UNIQUE INDEX "Payment_cakto_order_id_key" ON "Payment"("cakto_order_id");

-- Reversão (down):
-- DROP INDEX "Payment_cakto_order_id_key";
-- ALTER TABLE "Payment" DROP COLUMN "cakto_event";
-- ALTER TABLE "Payment" DROP COLUMN "cakto_ref_id";
-- ALTER TABLE "Payment" DROP COLUMN "cakto_order_id";
-- DROP INDEX "Subscription_cakto_subscription_id_idx";
-- ALTER TABLE "Subscription" DROP COLUMN "cakto_checkout_url";
-- ALTER TABLE "Subscription" DROP COLUMN "cakto_offer_id";
-- ALTER TABLE "Subscription" DROP COLUMN "cakto_product_id";
-- ALTER TABLE "Subscription" DROP COLUMN "cakto_subscription_id";
-- ALTER TABLE "Plan" DROP COLUMN "cakto_offer_id";
-- ALTER TABLE "Plan" DROP COLUMN "cakto_product_id";
