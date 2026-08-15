import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { MessageStatus } from '@prospector/types';
import { QUEUE_NAMES } from '@prospector/queues';
import { brasiliaWindow, isInsideWindow, startOfBrasiliaDay } from '@prospector/utils';
import { buildFirstContactMessage } from '@prospector/ai';
import { getWorkerQueue } from '../queues';
import { redis, PUMP_RUN_KEY, NEXT_SEND_KEY } from '../services/redis';

const logger = createLogger('worker.campaign');

interface PumpJobData {
  campaignId: string;
  businessId: string;
  runId: string;
}

/**
 * Pump da campanha: processa um lote de leads respeitando limites diários
 * e re-enfileira a si mesmo após o intervalo configurado.
 *
 * Coordenação: cada ciclo usa um jobId único; o runId corrente é guardado no
 * Redis. Jobs de uma "execução" anterior (runId antigo) são ignorados, o que
 * impede dois pumps concorrentes para a mesma campanha.
 */
export async function processCampaignPump(job: { id?: string; data: PumpJobData }): Promise<void> {
  const { campaignId, businessId, runId } = job.data;

  // Ignora pumps de execuções antigas (ex.: após reiniciar/retomar a campanha)
  const currentRun = await redis.get(PUMP_RUN_KEY(campaignId));
  if (currentRun && currentRun !== runId) {
    logger.debug('Pump obsoleto ignorado', { campaign_id: campaignId, run_id: runId, current_run: currentRun });
    return;
  }

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, business_id: businessId } });
  if (!campaign) {
    logger.warn('Campanha não encontrada; pump encerrado', { campaign_id: campaignId });
    return;
  }

  if (campaign.status !== 'ACTIVE') {
    logger.info('Campanha não está ativa; pump encerrado', {
      campaign_id: campaignId,
      status: campaign.status,
    });
    return;
  }

  const now = new Date();

  // Janela diária de envio (hora de início em Brasília). Sem start_hour → janela 24h.
  let windowOpen = startOfBrasiliaDay(now);
  let windowClose: Date | null = null;
  if (campaign.start_hour !== null && campaign.start_hour !== undefined) {
    const startHour = Math.floor(campaign.start_hour / 60);
    const startMinute = campaign.start_hour % 60;
    const w = brasiliaWindow(now, startHour, startMinute);
    windowOpen = w.open;
    windowClose = w.close;
  }

  // Antes da hora de início: aguarda a abertura da janela.
  if (windowClose && !isInsideWindow(now, windowOpen, windowClose)) {
    const waitMs = Math.max(0, windowOpen.getTime() - now.getTime());
    logger.info('Pump antes da hora de início; aguardando abertura', {
      campaign_id: campaignId,
      start_hour: campaign.start_hour,
      wait_ms: waitMs,
    });
    if (waitMs > 0) {
      await redis.set(NEXT_SEND_KEY(campaignId), String(windowOpen.getTime()), 'EX', 86400);
      await scheduleNextPump(campaignId, businessId, runId, Math.round(waitMs / 1000));
    } else {
      await scheduleNextPump(campaignId, businessId, runId, campaign.interval_seconds);
    }
    return;
  }

  // Conta como "usado hoje" também as mensagens já agendadas (QUEUED/aguardando),
  // para o limite diário nunca ser ultrapassado mesmo com envios pendentes.
  const ACTIVE_OUT_STATUSES: MessageStatus[] = ['QUEUED', 'SENT', 'DELIVERED', 'READ'];

  const [usedWhatsapp, usedEmail] = await Promise.all([
    prisma.message.count({
      where: {
        campaign_id: campaignId,
        business_id: businessId,
        channel: 'WHATSAPP',
        direction: 'OUT',
        created_at: { gte: windowOpen },
        status: { in: ACTIVE_OUT_STATUSES },
      },
    }),
    prisma.message.count({
      where: {
        campaign_id: campaignId,
        business_id: businessId,
        channel: 'EMAIL',
        direction: 'OUT',
        created_at: { gte: windowOpen },
        status: { in: ACTIVE_OUT_STATUSES },
      },
    }),
  ]);

  let whatsappCapacity = Math.max(0, campaign.daily_whatsapp_limit - usedWhatsapp);
  let emailCapacity = Math.max(0, campaign.daily_email_limit - usedEmail);

  const totalCapacity = whatsappCapacity + emailCapacity;
  if (totalCapacity <= 0) {
    logger.info('Limites diários atingidos; pump pausado até próxima janela', {
      campaign_id: campaignId,
      whatsapp_capacity: whatsappCapacity,
      email_capacity: emailCapacity,
    });
    const waitMs = windowClose ? Math.max(0, windowClose.getTime() - now.getTime()) : campaign.interval_seconds * 1000;
    await redis.set(NEXT_SEND_KEY(campaignId), String(now.getTime() + Math.max(waitMs, 1000)), 'EX', 86400);
    return scheduleNextPump(campaignId, businessId, runId, Math.round(waitMs / 1000));
  }

  // Leads pendentes (next_attempt_at nulo ou vencido)
  const pending = await prisma.campaignLead.findMany({
    where: {
      campaign_id: campaignId,
      business_id: businessId,
      status: 'PENDING',
      OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: new Date() } }],
    },
    orderBy: { created_at: 'asc' },
    take: 50,
    include: { lead: true },
  });

  let dispatched = 0;

  // Estratégia de espaçamento (seguro para o WhatsApp):
  // despacha no MÁXIMO 1 mensagem por ciclo de pump. O intervalo entre ciclos é
  // o `interval_seconds` da campanha, então os envios ficam espaçados de verdade.
  for (const cl of pending) {
    if (dispatched >= 1) break;

    const lead = cl.lead;
    if (!lead) continue;

    const optedOut = (await prisma.optOut.count({ where: { lead_id: lead.id, business_id: businessId } })) > 0;
    if (optedOut) {
      await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'OPT_OUT' } });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'OPT_OUT' } });
      continue;
    }

    const message = buildFirstContactMessage(lead.business_name);
    let channel: 'WHATSAPP' | 'EMAIL' | null = null;

    if (lead.phone && whatsappCapacity > 0) {
      channel = 'WHATSAPP';
      whatsappCapacity -= 1;
    } else if (lead.email && emailCapacity > 0) {
      channel = 'EMAIL';
      emailCapacity -= 1;
    } else {
      continue;
    }

    await prisma.campaignLead.update({
      where: { id: cl.id },
      data: {
        status: 'PROCESSING',
        channel,
        attempts: { increment: 1 },
        last_attempt_at: new Date(),
      },
    });

    const queue = channel === 'WHATSAPP' ? QUEUE_NAMES.WHATSAPP_SEND : QUEUE_NAMES.EMAIL_SEND;
    await getWorkerQueue(queue).add(
      'send',
      {
        campaignLeadId: cl.id,
        leadId: lead.id,
        campaignId,
        businessId,
        phone: lead.phone ?? '',
        email: lead.email ?? '',
        message,
        subject: 'Falo com o responsável pelo estabelecimento?',
        retryCount: 0,
      },
      { jobId: `send-${cl.id}`, attempts: 1, removeOnComplete: true }
    );

    dispatched += 1;
    logger.debug('Lead enviado para fila de envio', {
      campaign_id: campaignId,
      campaign_lead_id: cl.id,
      channel,
    });
  }

  logger.info('Pump processado', {
    campaign_id: campaignId,
    run_id: runId,
    dispatched,
    whatsapp_capacity_left: whatsappCapacity,
    email_capacity_left: emailCapacity,
  });

  // Registra o horário do PRÓXIMO envio (para o contador regressivo do painel)
  if (dispatched > 0) {
    const nextAt = Date.now() + campaign.interval_seconds * 1000;
    await redis.set(NEXT_SEND_KEY(campaignId), String(nextAt), 'EX', 86400);
  } else {
    await redis.del(NEXT_SEND_KEY(campaignId));
  }

  await scheduleNextPump(campaignId, businessId, runId, campaign.interval_seconds);
}

async function scheduleNextPump(campaignId: string, businessId: string, runId: string, intervalSeconds: number): Promise<void> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, business_id: businessId }, select: { status: true } });
  if (!campaign || campaign.status !== 'ACTIVE') return;

  // jobId único para cada ciclo (o mesmo id ativo impediria o re-agendamento)
  await getWorkerQueue(QUEUE_NAMES.CAMPAIGN_PROCESSING).add(
    'pump',
    { campaignId, businessId, runId },
    {
      jobId: `pump-${campaignId}-${Date.now()}`,
      delay: intervalSeconds * 1000,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}
