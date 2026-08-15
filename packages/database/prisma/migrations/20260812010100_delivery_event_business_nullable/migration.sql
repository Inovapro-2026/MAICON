-- Alinha o banco ao schema: webhooks externos (Resend) criam DeliveryEvent sem
-- business_id; a coluna precisa ser nullable.
ALTER TABLE "DeliveryEvent" ALTER COLUMN "business_id" DROP NOT NULL;
