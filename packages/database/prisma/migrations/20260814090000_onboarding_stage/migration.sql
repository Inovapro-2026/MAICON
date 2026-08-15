-- Estágio de onboarding/captura do nome da conversa (IA).
-- Coluna nullable: conversas legadas derivam o estágio em runtime
-- (com histórico -> NAME_CAPTURED; sem histórico -> NOT_STARTED).

CREATE TYPE "OnboardingStage" AS ENUM (
  'NOT_STARTED',
  'GREETED',
  'COMPANY_INTRODUCED',
  'AWAITING_NAME',
  'NAME_CAPTURED'
);

ALTER TABLE "Conversation" ADD COLUMN "onboarding_stage" "OnboardingStage";

-- Reversível: caso precise reverter, remover coluna e tipo.
-- ALTER TABLE "Conversation" DROP COLUMN "onboarding_stage";
-- DROP TYPE "OnboardingStage";
