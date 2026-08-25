import "dotenv/config";
import { config } from "@prospector/config";
import { createLogger } from "@prospector/logger";
import { checkDatabaseConnection, prisma } from "@prospector/database";
import { QUEUE_NAMES } from "@prospector/queues";
import { initWorkerQueues, createWorker } from "./queues";
import { processLeadImport } from "./jobs/lead-import.processor";
import { processCampaignPump } from "./jobs/campaign.processor";
import { processWhatsAppSend } from "./jobs/whatsapp-send.processor";
import { processEmailSend } from "./jobs/email-send.processor";
import { processMessageReceived } from "./jobs/message-received.processor";
import { processAIResponse } from "./jobs/ai-response.processor";
import { processConversationLearning } from "./jobs/conversation-learning.processor";
import { processWebhook } from "./jobs/webhook.processor";
import { processProspection } from "./jobs/prospect.processor";
import { processLeadEnrichment } from "./jobs/lead-enrichment.processor";
import { processRetry } from "./jobs/retry.processor";
import { processDeadLetter } from "./jobs/dead-letter.processor";
import { startWhatsAppRuntime } from "./whatsapp/runtime";
import { startControlServer } from "./server";

const logger = createLogger("worker");

const workers: import("bullmq").Worker[] = [];

function registerWorkers(): void {
  workers.push(createWorker(QUEUE_NAMES.LEAD_IMPORT, processLeadImport));
  workers.push(
    createWorker(QUEUE_NAMES.CAMPAIGN_PROCESSING, processCampaignPump),
  );
  workers.push(createWorker(QUEUE_NAMES.WHATSAPP_SEND, processWhatsAppSend));
  workers.push(createWorker(QUEUE_NAMES.EMAIL_SEND, processEmailSend));
  workers.push(
    createWorker(QUEUE_NAMES.MESSAGE_RECEIVED, processMessageReceived),
  );
  workers.push(createWorker(QUEUE_NAMES.AI_RESPONSE, processAIResponse));
  workers.push(
    createWorker(QUEUE_NAMES.CONVERSATION_LEARNING, processConversationLearning),
  );
  workers.push(createWorker(QUEUE_NAMES.WEBHOOK_PROCESSING, processWebhook));
  // Prospecção: processo dedicado do worker (nunca no HTTP), com concorrência própria.
  workers.push(
    createWorker(QUEUE_NAMES.PROSPECTION, processProspection, {
      concurrency: config.prospector.concurrency,
    }),
  );
  workers.push(
    createWorker(QUEUE_NAMES.LEAD_ENRICHMENT, processLeadEnrichment, {
      concurrency: config.prospector.scrapyConcurrency,
    }),
  );
  workers.push(createWorker(QUEUE_NAMES.RETRY, processRetry));
  workers.push(createWorker(QUEUE_NAMES.DEAD_LETTER, processDeadLetter));
  logger.info("Workers BullMQ registrados", { count: workers.length });
}

async function bootstrap(): Promise<void> {
  // Nunca derrubar o worker por uma rejeição não tratada; registra e segue.
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection no worker", { error: reason });
  });
  process.on("uncaughtException", (error) => {
    logger.error("uncaughtException no worker", { error });
  });

  await checkDatabaseConnection();
  initWorkerQueues();
  registerWorkers();
  startControlServer(config.ports.worker);
  await startWhatsAppRuntime();

  logger.info("Worker SAVYRON iniciado", {
    env: config.env,
    port: config.ports.worker,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Recebido ${signal} — encerrando worker`);
    await Promise.all(workers.map((w) => w.close()));
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  logger.error("Falha ao iniciar o worker", { error });
  process.exit(1);
});
