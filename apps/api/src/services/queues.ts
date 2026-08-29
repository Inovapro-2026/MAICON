import { Queue } from 'bullmq';
import { config } from '@prospector/config';
import { createLogger } from '@prospector/logger';
import { ALL_QUEUES, QUEUE_NAMES } from '@prospector/queues';

const logger = createLogger('api.queues');

const connection = { url: config.redis.url };

const DEFAULT_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: 100,
  removeOnFail: 1000,
};

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queues.set(name, queue);
    logger.info('Fila criada', { queue: name });
  }
  return queue;
}

export function getApiQueues(): { [K in keyof typeof QUEUE_NAMES]: Queue } {
  return {
    LEAD_IMPORT: getQueue(QUEUE_NAMES.LEAD_IMPORT),
    CAMPAIGN_PROCESSING: getQueue(QUEUE_NAMES.CAMPAIGN_PROCESSING),
    WHATSAPP_SEND: getQueue(QUEUE_NAMES.WHATSAPP_SEND),
    EMAIL_SEND: getQueue(QUEUE_NAMES.EMAIL_SEND),
    MESSAGE_RECEIVED: getQueue(QUEUE_NAMES.MESSAGE_RECEIVED),
    AI_RESPONSE: getQueue(QUEUE_NAMES.AI_RESPONSE),
    WEBHOOK_PROCESSING: getQueue(QUEUE_NAMES.WEBHOOK_PROCESSING),
    PROSPECTION: getQueue(QUEUE_NAMES.PROSPECTION),
    LEAD_ENRICHMENT: getQueue(QUEUE_NAMES.LEAD_ENRICHMENT),
    WHATSAPP_GROUP_EXTRACTION: getQueue(QUEUE_NAMES.WHATSAPP_GROUP_EXTRACTION),
    CONVERSATION_LEARNING: getQueue(QUEUE_NAMES.CONVERSATION_LEARNING),
    RETRY: getQueue(QUEUE_NAMES.RETRY),
    DEAD_LETTER: getQueue(QUEUE_NAMES.DEAD_LETTER),
  };
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}

/** Cria as filas no Redis (idempotente) — usado no boot. */
export function initQueues(): void {
  for (const name of ALL_QUEUES) {
    getQueue(name);
  }
  logger.info('Filas BullMQ inicializadas', { count: ALL_QUEUES.length });
}
