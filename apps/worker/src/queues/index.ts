import { Worker, Queue } from 'bullmq';
import { config } from '@prospector/config';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';

const logger = createLogger('worker.queues');

const connection = { url: config.redis.url };

export const workerQueues: Record<string, Queue> = {};

export function getWorkerQueue(name: string): Queue {
  if (!workerQueues[name]) {
    workerQueues[name] = new Queue(name, {
      connection,
      defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 1000 },
    });
  }
  return workerQueues[name];
}

export function createWorker(
  name: string,
  processor: (job: any) => Promise<void>,
  options?: { concurrency?: number }
): Worker {
  const concurrency = options?.concurrency ?? 5;
  const worker = new Worker(
    name,
    async (job) => {
      const started = Date.now();
      try {
        await processor(job);
        logger.info('Job processado', { queue: name, jobId: String(job.id), duration_ms: Date.now() - started });
      } catch (error) {
        logger.error('Falha no job', { queue: name, jobId: String(job.id), error });
        throw error;
      }
    },
    { connection, concurrency }
  );

  worker.on('failed', (job, err) => {
    logger.error('Job falhou (BullMQ)', { queue: name, jobId: job ? String(job.id) : '?', error: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Erro do worker BullMQ', { queue: name, error: err.message });
  });

  return worker;
}

export function initWorkerQueues(): void {
  for (const name of Object.values(QUEUE_NAMES)) {
    getWorkerQueue(name);
  }
  logger.info('Filas do worker inicializadas', { count: Object.keys(QUEUE_NAMES).length });
}
