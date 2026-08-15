-- ============================================================================
-- SAVYRON — FASE 3 (ADMIN + BILLING + ONBOARDING)
-- Incremental e reversível. Nenhuma tabela existente é apagada.
--   Extende BusinessStatus com PENDING_PAYMENT
--   Cria Plan, PlanFeature, Subscription, Payment, EmailVerification,
--   Usage, AuditLog
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. BusinessStatus: adiciona PENDING_PAYMENT (não remove valores existentes)
-- ---------------------------------------------------------------------------
ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';

-- ---------------------------------------------------------------------------
-- 2. Planos
-- ---------------------------------------------------------------------------
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanFeature" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limit" INTEGER,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");
CREATE UNIQUE INDEX "PlanFeature_plan_id_feature_key" ON "PlanFeature"("plan_id", "feature");
CREATE INDEX "Plan_feature_plan_id_idx" ON "PlanFeature"("plan_id");
CREATE INDEX "Plan_active_idx" ON "Plan"("active");

ALTER TABLE "PlanFeature"
    ADD CONSTRAINT "PlanFeature_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Assinaturas e pagamentos
-- ---------------------------------------------------------------------------
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RECEIVED', 'OVERDUE', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CARD');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "asaas_customer_id" TEXT,
    "asaas_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "plan_name" TEXT,
    "plan_price" DECIMAL(10,2),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "asaas_payment_id" TEXT,
    "method" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "value" DECIMAL(10,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "pix_payload" TEXT,
    "pix_qr_base64" TEXT,
    "external_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_business_id_key" ON "Subscription"("business_id");
CREATE INDEX "Subscription_business_id_status_idx" ON "Subscription"("business_id", "status");
CREATE INDEX "Subscription_plan_id_idx" ON "Subscription"("plan_id");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_asaas_customer_id_idx" ON "Subscription"("asaas_customer_id");
CREATE INDEX "Subscription_asaas_subscription_id_idx" ON "Subscription"("asaas_subscription_id");
CREATE INDEX "Payment_business_id_created_at_idx" ON "Payment"("business_id", "created_at");
CREATE INDEX "Payment_subscription_id_idx" ON "Payment"("subscription_id");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE UNIQUE INDEX "Payment_asaas_payment_id_key" ON "Payment"("asaas_payment_id");

ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Verificação de e-mail (onboarding)
-- ---------------------------------------------------------------------------
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailVerification_email_created_at_idx" ON "EmailVerification"("email", "created_at");

-- ---------------------------------------------------------------------------
-- 5. Consumo por empresa
-- ---------------------------------------------------------------------------
CREATE TABLE "Usage" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Usage_business_id_metric_period_key" ON "Usage"("business_id", "metric", "period");
CREATE INDEX "Usage_business_id_period_idx" ON "Usage"("business_id", "period");
CREATE INDEX "Usage_metric_period_idx" ON "Usage"("metric", "period");

ALTER TABLE "Usage"
    ADD CONSTRAINT "Usage_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Auditoria
-- ---------------------------------------------------------------------------
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT,
    "business_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_business_id_created_at_idx" ON "AuditLog"("business_id", "created_at");
CREATE INDEX "AuditLog_actor_created_at_idx" ON "AuditLog"("actor", "created_at");
CREATE INDEX "AuditLog_action_created_at_idx" ON "AuditLog"("action", "created_at");
CREATE INDEX "AuditLog_entity_entity_id_idx" ON "AuditLog"("entity", "entity_id");

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. REVERSÃO (down) — para rollback manual, quando necessário
-- ---------------------------------------------------------------------------
-- DROP TABLE "AuditLog";
-- DROP TABLE "Usage";
-- DROP TABLE "EmailVerification";
-- DROP TABLE "Payment";
-- DROP TABLE "Subscription";
-- DROP TABLE "PlanFeature";
-- DROP TABLE "Plan";
-- DROP TYPE "PaymentMethod";
-- DROP TYPE "PaymentStatus";
-- DROP TYPE "SubscriptionStatus";
-- DROP TYPE "BillingInterval";
-- Obs.: BusinessStatus com PENDING_PAYMENT é aditivo; para remover, migrar os
-- valores antes (ex.: UPDATE "Business" SET status='TRIAL' WHERE status='PENDING_PAYMENT')
-- e então: ALTER TYPE "BusinessStatus" RENAME TO "BusinessStatus_old";
--          CREATE TYPE "BusinessStatus" AS ENUM ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED');
--          ALTER TABLE "Business" ALTER COLUMN "status" TYPE "BusinessStatus" USING "status"::text::\"BusinessStatus\";
--          DROP TYPE "BusinessStatus_old";