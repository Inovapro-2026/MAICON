-- ============================================================================
-- SAVYRON — TABELA DE E-MAILS ENVIADOS (EmailLog)
-- Histórico de e-mails enviados via Resend (prospecção, OTP, recuperação).
-- Reversível: apenas CREATE TABLE (nenhuma coluna removida).
-- ============================================================================

CREATE TYPE "EmailLogStatus" AS ENUM ('SENT', 'FAILED', 'BOUNCED');

CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'SENT',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "provider_message_id" TEXT,
    "related_campaign_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLog_business_id_sent_at_idx" ON "EmailLog"("business_id", "sent_at");
CREATE INDEX "EmailLog_business_id_status_idx" ON "EmailLog"("business_id", "status");

ALTER TABLE "EmailLog"
    ADD CONSTRAINT "EmailLog_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "Business"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Reversão (down):
-- ALTER TABLE "EmailLog" DROP CONSTRAINT "EmailLog_business_id_fkey";
-- DROP INDEX "EmailLog_business_id_status_idx";
-- DROP INDEX "EmailLog_business_id_sent_at_idx";
-- DROP TABLE "EmailLog";
-- DROP TYPE "EmailLogStatus";
