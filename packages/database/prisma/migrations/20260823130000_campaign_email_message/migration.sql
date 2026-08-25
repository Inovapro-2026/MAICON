-- AlterTable: mensagem de e-mail configurável por campanha (canais EMAIL e BOTH).
ALTER TABLE "Campaign" ADD COLUMN "email_subject" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "email_body" TEXT;
