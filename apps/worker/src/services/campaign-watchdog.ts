import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { getWhatsAppManager } from '@prospector/whatsapp';
import { getWorkerQueue } from '../queues';
import { redis, PUMP_RUN_KEY, NEXT_SEND_KEY } from './redis';
import { markMessageFailed } from './messages';

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
 * Tempo máximo que um lead pode ficar em PROCESSING aguardando o DELIVERY_ACK
 * do WhatsApp. Passado esse tempo sem confirmação de entrega, o watchdog
 * reconcilia: confere o registro do número e decide entre SENT (válido) ou
 * ERROR (não registrado — mensagem nunca chega ao destinatário).
 */
const STUCK_SEND_THRESHOLD_MS = 10 * 60_000; // 10min

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
      await this.reconcileStuckSends();

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

  /**
   * Reconciliação de envios travados: CampaignLeads em PROCESSING há mais de
   * STUCK_SEND_THRESHOLD_MS sem confirmação de entrega (DELIVERY_ACK). O
   * watchdog re-consulta o diretório WhatsApp para decidir:
   *   - NÃO registrado → ERROR (falso positivo: "Enviado" sem entrega real).
   *   - Registrado     → SENT (número válido; mensagem será entregue quando online).
   *   - Indeterminado  → mantém PROCESSING para próximo ciclo.
   * Também promove leads cujo ACK foi perdido (Message DELIVERED/READ mas
   * CampaignLead ainda PROCESSING) e reverte leads sem mensagem à fila.
   */
  private async reconcileStuckSends(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_SEND_THRESHOLD_MS);
    const stuck = await prisma.campaignLead.findMany({
      where: { status: 'PROCESSING', last_attempt_at: { lte: cutoff } },
      take: 200,
      include: { lead: { select: { phone: true } } },
    });
    if (stuck.length === 0) return;

    logger.info('Watchdog: reconciliação de envios travados', { count: stuck.length });

    for (const cl of stuck) {
      try {
        const lastMsg = await prisma.message.findFirst({
          where: {
            lead_id: cl.lead_id,
            campaign_id: cl.campaign_id,
            business_id: cl.business_id,
            direction: 'OUT',
          },
          orderBy: { created_at: 'desc' },
          select: { id: true, status: true, channel: true },
        });

        if (!lastMsg) {
          // Job nunca criou a mensagem; devolve à fila para tentar de novo
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'PENDING', next_attempt_at: new Date() } });
          logger.warn('Watchdog: lead sem mensagem; devolvido à fila', { campaign_lead_id: cl.id, lead_id: cl.lead_id });
          continue;
        }

        if (lastMsg.status === 'DELIVERED' || lastMsg.status === 'READ') {
          // ACK chegou mas não promoveu (worker restart?); promove agora
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'SENT' } });
          await prisma.lead.updateMany({
            where: { id: cl.lead_id, business_id: cl.business_id, status: { in: ['PENDING', 'PROCESSING'] } },
            data: { status: 'SENT' },
          });
          logger.info('Watchdog: lead promovido a SENT (ACK perdido recuperado)', { campaign_lead_id: cl.id, lead_id: cl.lead_id });
          continue;
        }

        if (lastMsg.status === 'FAILED') {
          // Já está em dead-letter; reflete no CampaignLead se não foi feito
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'ERROR' } });
          await prisma.lead.update({ where: { id: cl.lead_id }, data: { status: 'ERROR' } });
          continue;
        }

        // status SENT (aceita pelo servidor, sem ACK de entrega)
        if (lastMsg.status === 'SENT' && cl.channel === 'WHATSAPP' && cl.lead?.phone) {
          const manager = getWhatsAppManager(cl.business_id);
          const reg = await manager.checkWhatsAppRegistration(cl.lead.phone);
          if (reg === false) {
            await prisma.lead.update({ where: { id: cl.lead_id }, data: { status: 'ERROR' } });
            await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'ERROR' } });
            await markMessageFailed(lastMsg.id, 'Número não registrado no WhatsApp (reconciliação)');
            logger.warn('Watchdog: número não é WhatsApp; revertido para ERROR', {
              campaign_lead_id: cl.id, lead_id: cl.lead_id, phone: cl.lead.phone,
            });
          } else if (reg === true) {
            await prisma.lead.updateMany({
              where: { id: cl.lead_id, business_id: cl.business_id, status: 'PROCESSING' },
              data: { status: 'SENT' },
            });
            await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'SENT' } });
            logger.info('Watchdog: lead promovido a SENT (número válido, entrega presumida)', {
              campaign_lead_id: cl.id, lead_id: cl.lead_id,
            });
          }
          // reg === null: mantém PROCESSING, tenta no próximo ciclo
        }
      } catch (error) {
        logger.error('Watchdog: erro ao reconciliar lead', {
          campaign_lead_id: cl.id,
          lead_id: cl.lead_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const campaignWatchdog = new CampaignWatchdog();
