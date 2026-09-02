-- Rollback: remove tudo relacionado ao Instagram (canal, tabelas, colunas, enums)
-- Executar depois da reversão do código.

-- 1) Limpar dados do Instagram
DELETE FROM "InstagramSendLog";
DELETE FROM "InstagramAccount";
DELETE FROM "Message" WHERE channel = 'INSTAGRAM';
DELETE FROM "CampaignLead" WHERE channel = 'INSTAGRAM';
DELETE FROM "Lead" WHERE source = 'INSTAGRAM';
DELETE FROM "OptOut" WHERE channel = 'INSTAGRAM';

-- 2) Converter campanhas que usam canal Instagram para WhatsApp
UPDATE "Campaign" SET channel_mode = 'WHATSAPP', instagram_first_message = NULL, daily_instagram_limit = 10 WHERE channel_mode = 'INSTAGRAM';

-- 3) Remover ProspectionRun com fontes Instagram
DELETE FROM "ProspectionRun" WHERE sources::text LIKE '%instagram%';

-- 4) Remover tabelas Instagram
DROP TABLE IF EXISTS "InstagramSendLog";
DROP TABLE IF EXISTS "InstagramAccount";

-- 5) Remover colunas Instagram do Lead
DROP INDEX IF EXISTS "Lead_business_id_instagram_username_key";
DROP INDEX IF EXISTS "Lead_instagram_username_idx";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS instagram_username;
ALTER TABLE "Lead" DROP COLUMN IF EXISTS instagram_user_id;
ALTER TABLE "Lead" DROP COLUMN IF EXISTS instagram_profile_url;
ALTER TABLE "Lead" DROP COLUMN IF EXISTS instagram_display_name;
ALTER TABLE "Lead" DROP COLUMN IF EXISTS instagram_bio;
ALTER TABLE "Lead" DROP COLUMN IF EXISTS instagram_status;

-- 6) Remover colunas Instagram do Campaign
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS daily_instagram_limit;
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS instagram_first_message;

-- 7) Remover coluna Instagram do BusinessSettings
ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS instagram_daily_limit;

-- 8) Remover INSTAGRAM dos enums (recreate sem o valor)
-- LeadSource: CSV, MANUAL, TEST, WEB, WHATSAPP_GROUP (sem INSTAGRAM)
ALTER TABLE "Lead" ALTER COLUMN source DROP DEFAULT;
ALTER TYPE "LeadSource" RENAME TO "LeadSource_old";
CREATE TYPE "LeadSource" AS ENUM ('CSV', 'MANUAL', 'TEST', 'WEB', 'WHATSAPP_GROUP');
ALTER TABLE "Lead" ALTER COLUMN source TYPE "LeadSource" USING source::text::"LeadSource";
ALTER TABLE "Lead" ALTER COLUMN source SET DEFAULT 'CSV'::"LeadSource";
DROP TYPE "LeadSource_old";

-- MessageChannel: WHATSAPP, EMAIL (sem INSTAGRAM)
ALTER TYPE "MessageChannel" RENAME TO "MessageChannel_old";
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL');
ALTER TABLE "Message" ALTER COLUMN channel TYPE "MessageChannel" USING channel::text::"MessageChannel";
ALTER TABLE "CampaignLead" ALTER COLUMN channel TYPE "MessageChannel" USING channel::text::"MessageChannel";
DROP TYPE "MessageChannel_old";

-- ChannelMode: WHATSAPP, EMAIL, BOTH (sem INSTAGRAM)
ALTER TABLE "Campaign" ALTER COLUMN channel_mode DROP DEFAULT;
ALTER TYPE "ChannelMode" RENAME TO "ChannelMode_old";
CREATE TYPE "ChannelMode" AS ENUM ('WHATSAPP', 'EMAIL', 'BOTH');
ALTER TABLE "Campaign" ALTER COLUMN channel_mode TYPE "ChannelMode" USING channel_mode::text::"ChannelMode";
ALTER TABLE "Campaign" ALTER COLUMN channel_mode SET DEFAULT 'WHATSAPP'::"ChannelMode";
DROP TYPE "ChannelMode_old";

-- ChannelType: WHATSAPP, EMAIL (sem INSTAGRAM)
ALTER TYPE "ChannelType" RENAME TO "ChannelType_old";
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'EMAIL');
DROP TYPE "ChannelType_old";

-- OptOutChannel: WHATSAPP, EMAIL (sem INSTAGRAM)
ALTER TYPE "OptOutChannel" RENAME TO "OptOutChannel_old";
CREATE TYPE "OptOutChannel" AS ENUM ('WHATSAPP', 'EMAIL');
ALTER TABLE "OptOut" ALTER COLUMN channel TYPE "OptOutChannel" USING channel::text::"OptOutChannel";
DROP TYPE "OptOutChannel_old";

-- 9) Remover enum types do Instagram
DROP TYPE IF EXISTS "InstagramAccountStatus";
DROP TYPE IF EXISTS "InstagramSendStatus";