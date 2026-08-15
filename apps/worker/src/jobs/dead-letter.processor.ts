import { createLogger } from '@prospector/logger';

const logger = createLogger('worker.dead-letter');

interface DeadLetterData {
  queue: string;
  payload: unknown;
  reason: string;
}

/** Consumidor da fila DEAD_LETTER: apenas registra o erro de forma estruturada. */
export async function processDeadLetter(job: { id?: string; data: DeadLetterData }): Promise<void> {
  const { queue, payload, reason } = job.data;
  logger.error('Job movido para DEAD_LETTER (falha permanente)', {
    queue,
    payload: JSON.stringify(payload).slice(0, 2000),
    reason,
  });
}
