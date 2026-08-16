-- CreateTable
CREATE TABLE "ConversationMemory" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "current_goal" TEXT NOT NULL DEFAULT 'start_rapport',
    "next_action" TEXT NOT NULL DEFAULT 'BUILD_RAPPORT',
    "last_question" TEXT NOT NULL DEFAULT '',
    "sales_stage" TEXT NOT NULL DEFAULT 'NEW',
    "known_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMemory_business_id_key_key" ON "ConversationMemory"("business_id", "key");

-- CreateIndex
CREATE INDEX "ConversationMemory_business_id_idx" ON "ConversationMemory"("business_id");
