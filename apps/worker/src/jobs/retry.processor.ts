import { createLogger } from '@prospector/logger';
import { getWorkerQueue } from '../queues';

const logger = createLogger('worker.retry');

interface RetryData {
  queue: string;
  payload: Record<string, unknown>;
  reason: string;
  originalAttempts: number;
}

/** Re-enfileira o job original com a contagem de tentativas incrementada. */
export async function processRetry(job: { id?: string; data: RetryData }): Promise<void> {
  const { queue, payload, reason, originalAttempts } = job.data;

  logger.info('Executando retry', { queue, attempt: originalAttempts, reason });

  const uniqueKey = (payload.leadId as string) ?? `${payload.campaignLeadId ?? ''}:${Date.now()}`;
  await getWorkerQueue(queue).add(
    'send',
    payload,
    {
      jobId: `retry-${uniqueKey}-r${originalAttempts}`,
      delay: 3000,
      attempts: 1,
      removeOnComplete: true,
    }
  );
}
