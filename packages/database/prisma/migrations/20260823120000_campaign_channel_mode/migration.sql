-- CreateEnum
CREATE TYPE "ChannelMode" AS ENUM ('WHATSAPP', 'EMAIL', 'BOTH');

-- AlterTable: campanhas existentes continuam como WHATSAPP (comportamento
-- efetivo anterior — e-mail só disparava como fallback sem telefone).
ALTER TABLE "Campaign" ADD COLUMN "channel_mode" "ChannelMode" NOT NULL DEFAULT 'WHATSAPP';
