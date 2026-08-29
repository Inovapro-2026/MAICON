-- ============================================================================
-- SAVYRON — MIGRAÇÃO DE GATEWAY: CAKTO -> ABACATEPAY (PIX manual)
-- Adiciona campos AbacatePay em Subscription, Payment e Business.
-- Campos Stripe/Cakto mantidos em paralelo (sem perda de dados; o Cakto segue
-- ativo até a AbacatePay ser validada com um ciclo real de pagamento).
-- Reversível: apenas ADD COLUMN + CREATE INDEX (nenhuma coluna removida).
-- ============================================================================

-- Business: motivo da suspensão automática por vencimento de assinatura
-- (permite redirecionar o login SUSPENDED -> /payment sem bloquear suspensões
-- manuais feitas pelo admin).
ALTER TABLE "Business" ADD COLUMN "suspension_reason" TEXT;

-- Subscription: referências AbacatePay (cliente e último checkout/PIX criado)
ALTER TABLE "Subscription" ADD COLUMN "abacatepay_customer_id" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "abacatepay_checkout_id" TEXT;

CREATE INDEX "Subscription_abacatepay_checkout_id_idx" ON "Subscription"("abacatepay_checkout_id");

-- Payment: referências AbacatePay (dedup por checkout id + evento processado)
ALTER TABLE "Payment" ADD COLUMN "abacatepay_checkout_id" TEXT;
ALTER TABLE "Payment" ADD COLUMN "abacatepay_event" TEXT;

CREATE UNIQUE INDEX "Payment_abacatepay_checkout_id_key" ON "Payment"("abacatepay_checkout_id");

-- Reversão (down):
-- DROP INDEX "Payment_abacatepay_checkout_id_key";
-- ALTER TABLE "Payment" DROP COLUMN "abacatepay_event";
-- ALTER TABLE "Payment" DROP COLUMN "abacatepay_checkout_id";
-- DROP INDEX "Subscription_abacatepay_checkout_id_idx";
-- ALTER TABLE "Subscription" DROP COLUMN "abacatepay_checkout_id";
-- ALTER TABLE "Subscription" DROP COLUMN "abacatepay_customer_id";
-- ALTER TABLE "Business" DROP COLUMN "suspension_reason";