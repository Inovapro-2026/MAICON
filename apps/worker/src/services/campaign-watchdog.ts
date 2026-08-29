import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { getWorkerQueue } from '../queues';
import { redis, PUMP_RUN_KEY, NEXT_SEND_KEY } from './redis';

const logger = createLogger('worker.campaign-watchdog');

/**
 * Intervalo entre varreduras do watchdog (ms).
 * Cada 60s verifica campanhas ACTIVE que não têm pump agendado.
 */
const WATCHDOG_INTERVAL_MS = 60_000;

/**
 * Janela de tolerância: se next_send_at está há mais de STALE_THRESHOLD_MS
 * no passado e a campanha ainda está ACTIVE, o pump parou e precisa ser
 * re-agendado.
 */
const STALE_THRESHOLD_MS = 90_000; // 1m30s

/**
 * CampaignWatchdog — varredura periódica que detecta campanhas ACTIVE cujo
 * pump BullMQ parou (crash do worker, restart, job perdido) e re-agenda
 * automaticamente. Garante que nenhuma campanha fique travada em segundo plano.
 */
export class CampaignWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    logger.info('CampaignWatchdog iniciado', { intervalMs: WATCHDOG_INTERVAL_MS });

    // Roda imediatamente ao iniciar para recuperar campanhas pós-restart
    void this.runReconciliation();

    this.timer = setInterval(() => {
      void this.runReconciliation();
    }, WATCHDOG_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('CampaignWatchdog parado');
    }
  }

  private async runReconciliation(): Promise<void> {
    try {
      const activeCampaigns = await prisma.campaign.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, business_id: true, interval_seconds: true },
      });

      if (activeCampaigns.length === 0) return;

      const now = Date.now();
      let recovered = 0;

      for (const campaign of activeCampaigns) {
        try {
          // Verifica se há um pump ativo na fila para esta campanha
          const queue = getWorkerQueue(QUEUE_NAMES.CAMPAIGN_PROCESSING);
          const delayed = await queue.getDelayed();
          const waiting = await queue.getWaiting();

          const hasPump = [...delayed, ...waiting].some(
            (job) =>
              job.name === 'pump' &&
              job.data?.campaignId === campaign.id
          );

          if (hasPump) continue; // Tudo certo, pump já está na fila

          // Verifica se o next_send_at está obsoleto (pump perdido)
          const nextSendStr = await redis.get(NEXT_SEND_KEY(campaign.id));
          const nextSend = nextSendStr ? Number(nextSendStr) : null;
          const isStale = !nextSend || now - nextSend > STALE_THRESHOLD_MS;

          if (!isStale) continue; // Ainda dentro da janela de tolerância

          // Obter ou criar runId
          let runId = await redis.get(PUMP_RUN_KEY(campaign.id));
          if (!runId) {
            runId = `watchdog-${campaign.id}-${now}`;
            await redis.set(PUMP_RUN_KEY(campaign.id), runId, 'EX', 86400);
          }

          // Re-agenda pump imediatamente (delay=0 para recuperação rápida)
          await queue.add(
            'pump',
            { campaignId: campaign.id, businessId: campaign.business_id, runId },
            {
              jobId: `pump-${campaign.id}-watchdog-${now}`,
              delay: 0,
              removeOnComplete: true,
              removeOnFail: true,
            }
          );

          logger.warn('Watchdog: pump re-agendado para campanha travada', {
            campaign_id: campaign.id,
            business_id: campaign.business_id,
            last_next_send: nextSend ? new Date(nextSend).toISOString() : 'nunca',
            stale_ms: nextSend ? now - nextSend : 'N/A',
          });
          recovered++;
        } catch (innerError) {
          logger.error('Watchdog: erro ao verificar campanha', {
            campaign_id: campaign.id,
            error: innerError instanceof Error ? innerError.message : String(innerError),
          });
        }
      }

      if (recovered > 0) {
        logger.info('Watchdog: reconciliação concluída', {
          checked: activeCampaigns.length,
          recovered,
        });
      }
    } catch (error) {
      logger.error('Watchdog: erro na varredura', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const campaignWatchdog = new CampaignWatchdog();
