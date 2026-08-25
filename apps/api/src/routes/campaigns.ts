import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { validateCampaignEmailConfig } from '@prospector/utils';
import { asyncHandler, ok } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/active-subscription';
import { getQueue } from '../services/queues';
import { getCampaignStats } from '../services/campaign-service';
import { redisClient, PUMP_RUN_KEY, NEXT_SEND_KEY } from '../services/redis';

const logger = createLogger('api.campaigns');

const CHANNEL_MODES = ['WHATSAPP', 'EMAIL', 'BOTH'] as const;
type ChannelModeValue = (typeof CHANNEL_MODES)[number];

function parseChannelMode(value: unknown): ChannelModeValue | null {
  const normalized = String(value ?? '').toUpperCase();
  return (CHANNEL_MODES as readonly string[]).includes(normalized) ? (normalized as ChannelModeValue) : null;
}

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth, requireBusiness);

/** POST /campaigns — cria campanha. */
campaignsRouter.post(
  '/',
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const { name, daily_whatsapp_limit, daily_email_limit, interval_seconds, is_test, start_hour } = req.body ?? {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Informe o nome da campanha' } });
    }

    // Limite de 1 campanha por empresa (risco de ban no WhatsApp por múltiplos
    // disparos no mesmo número). Campanha encerrada (FINISHED) ou excluída
    // libera a criação de uma nova.
    const liveCampaigns = await prisma.campaign.count({
      where: { business_id: businessId, status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (liveCampaigns > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Sua empresa já tem uma campanha ativa ou pausada. Encerre ou exclua a atual antes de criar outra.' },
      });
    }

    let channelMode: ChannelModeValue = 'WHATSAPP';
    if (req.body.channel_mode !== undefined && req.body.channel_mode !== null) {
      const parsed = parseChannelMode(req.body.channel_mode);
      if (!parsed) {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Modo de canal inválido (use WHATSAPP, EMAIL ou BOTH)' } });
      }
      channelMode = parsed;
    }

    const campaign = await prisma.campaign.create({
      data: {
        business_id: businessId,
        name: String(name).trim(),
        daily_whatsapp_limit: Math.max(1, Number(daily_whatsapp_limit) || 30),
        daily_email_limit: Math.max(1, Number(daily_email_limit) || 100),
        interval_seconds: Math.max(5, Number(interval_seconds) || 7200),
        is_test: Boolean(is_test),
        start_hour: normalizeStartHour(start_hour),
        channel_mode: channelMode,
        email_subject: typeof req.body.email_subject === 'string' && req.body.email_subject.trim() ? req.body.email_subject.trim() : null,
        email_body: typeof req.body.email_body === 'string' && req.body.email_body.trim() ? req.body.email_body.trim() : null,
        status: 'PAUSED',
      },
    });

    logger.info('Campanha criada', { campaign_id: campaign.id, name: campaign.name });
    return ok(res, campaign, 201);
  })
);

/** GET /campaigns — lista campanhas com estatísticas. */
campaignsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const campaigns = await prisma.campaign.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { campaign_leads: true, messages: true } } },
    });

    // Lê o horário do próximo envio de cada campanha (contador regressivo)
    const nextSends = await Promise.all(
      campaigns.map(async (c) => {
        const raw = await redisClient.get(NEXT_SEND_KEY(c.id));
        const ts = Number(raw);
        return { id: c.id, nextSendAt: raw && !Number.isNaN(ts) ? new Date(ts).toISOString() : null };
      })
    );
    const nextSendById = new Map(nextSends.map((n) => [n.id, n.nextSendAt]));

    const withStats = await Promise.all(
      campaigns.map(async (c) => ({
        ...c,
        next_send_at: nextSendById.get(c.id) ?? null,
        stats: await getCampaignStats(c.id, businessId),
      }))
    );
    return ok(res, withStats);
  })
);

/** POST /campaigns/pause-all — pausa imediatamente todas as campanhas ativas. */
campaignsRouter.post(
  '/pause-all',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const result = await prisma.campaign.updateMany({
      where: { status: 'ACTIVE', business_id: businessId },
      data: { status: 'PAUSED' },
    });
    logger.warn('TODAS as campanhas pausadas (pânico)', { count: result.count });
    return ok(res, { message: `${result.count} campanha(s) pausada(s)` });
  })
);

/** GET /campaigns/:id — detalhe + stats. */
campaignsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const campaign = await prisma.campaign.findFirst({ where: { id: String(req.params.id), business_id: businessId } });
    if (!campaign) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });
    const stats = await getCampaignStats(campaign.id, businessId);
    const raw = await redisClient.get(NEXT_SEND_KEY(campaign.id));
    const ts = Number(raw);
    const next_send_at = raw && !Number.isNaN(ts) ? new Date(ts).toISOString() : null;
    return ok(res, { campaign: { ...campaign, next_send_at }, stats });
  })
);

/** GET /campaigns/:id/leads — leads da campanha. */
campaignsRouter.get(
  '/:id/leads',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const campaignId = String(req.params.id);
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, business_id: businessId } });
    if (!campaign) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });

    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Number(req.query.pageSize ?? 20));
    const [total, items] = await Promise.all([
      prisma.campaignLead.count({ where: { campaign_id: campaignId, business_id: businessId } }),
      prisma.campaignLead.findMany({
        where: { campaign_id: campaignId, business_id: businessId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lead: true },
      }),
    ]);
    return ok(res, { total, page, pageSize, items });
  })
);

/** PATCH /campaigns/:id — atualiza limites/intervalo/nome. */
campaignsRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const exists = await prisma.campaign.findFirst({ where: { id, business_id: businessId } });
    if (!exists) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });

    const data: Record<string, unknown> = {};
    if (req.body.name) data.name = String(req.body.name).trim();
    if (req.body.daily_whatsapp_limit !== undefined) data.daily_whatsapp_limit = Math.max(1, Number(req.body.daily_whatsapp_limit));
    if (req.body.daily_email_limit !== undefined) data.daily_email_limit = Math.max(1, Number(req.body.daily_email_limit));
    if (req.body.interval_seconds !== undefined) data.interval_seconds = Math.max(5, Number(req.body.interval_seconds));
    if (req.body.start_hour !== undefined) data.start_hour = normalizeStartHour(req.body.start_hour);
    if (req.body.channel_mode !== undefined) {
      const parsed = parseChannelMode(req.body.channel_mode);
      if (!parsed) {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Modo de canal inválido (use WHATSAPP, EMAIL ou BOTH)' } });
      }
      data.channel_mode = parsed;
    }
    if (req.body.email_subject !== undefined) {
      data.email_subject = typeof req.body.email_subject === 'string' && req.body.email_subject.trim() ? req.body.email_subject.trim() : null;
    }
    if (req.body.email_body !== undefined) {
      data.email_body = typeof req.body.email_body === 'string' && req.body.email_body.trim() ? req.body.email_body.trim() : null;
    }

    const campaign = await prisma.campaign.update({ where: { id }, data });
    logger.info('Campanha atualizada', { campaign_id: id });
    return ok(res, campaign);
  })
);

/** POST /campaigns/:id/start — inicia campanha. */
campaignsRouter.post(
  '/:id/start',
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const campaign = await prisma.campaign.findFirst({ where: { id, business_id: businessId } });
    if (!campaign) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });
    if (campaign.status === 'FINISHED') {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Campanha encerrada não pode ser reiniciada' } });
    }
    // Canal EMAIL/BOTH exige assunto e mensagem de e-mail configurados.
    const emailError = validateCampaignEmailConfig(campaign.channel_mode, campaign.email_subject, campaign.email_body);
    if (emailError) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: emailError } });
    }

    await prisma.campaign.update({ where: { id }, data: { status: 'ACTIVE' } });
    // Limpa o contador de "próximo envio" de uma execução anterior: o 1º lead
    // é enviado IMEDIATAMENTE pelo primeiro pump (sem delay); o countdown só
    // volta a aparecer para o 2º envio, daqui a interval_seconds.
    await redisClient.del(NEXT_SEND_KEY(id)).catch(() => undefined);
    await schedulePump(id, businessId);

    logger.info('Campanha iniciada', { campaign_id: id });
    return ok(res, { message: 'Campanha iniciada' });
  })
);

/** POST /campaigns/:id/pause — pausa imediatamente. */
campaignsRouter.post(
  '/:id/pause',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const campaign = await prisma.campaign.findFirst({ where: { id, business_id: businessId } });
    if (!campaign) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });

    await prisma.campaign.update({ where: { id }, data: { status: 'PAUSED' } });
    logger.info('Campanha pausada', { campaign_id: id });
    return ok(res, { message: 'Campanha pausada' });
  })
);

/** POST /campaigns/:id/resume — retoma. */
campaignsRouter.post(
  '/:id/resume',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const campaign = await prisma.campaign.findFirst({ where: { id, business_id: businessId } });
    if (!campaign) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });
    // Reabrir: permite retomar mesmo de FINISHED (volta a ficar ativa e re-agenda o pump)
    // Canal EMAIL/BOTH exige assunto e mensagem de e-mail configurados.
    const emailError = validateCampaignEmailConfig(campaign.channel_mode, campaign.email_subject, campaign.email_body);
    if (emailError) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: emailError } });
    }
    await prisma.campaign.update({ where: { id }, data: { status: 'ACTIVE' } });
    await redisClient.del(NEXT_SEND_KEY(id)).catch(() => undefined);
    await schedulePump(id, businessId);
    logger.info('Campanha retomada/reaberta', { campaign_id: id });
    return ok(res, { message: 'Campanha reaberta' });
  })
);

/** POST /campaigns/:id/finish — encerra campanha. */
campaignsRouter.post(
  '/:id/finish',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const campaign = await prisma.campaign.findFirst({ where: { id, business_id: businessId } });
    if (!campaign) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });

    await prisma.campaign.update({ where: { id }, data: { status: 'FINISHED' } });
    logger.info('Campanha encerrada', { campaign_id: id });
    return ok(res, { message: 'Campanha encerrada' });
  })
);

/** DELETE /campaigns/:id — exclui campanha (e seus vínculos de leads). */
campaignsRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const deleted = await prisma.campaign.deleteMany({ where: { id, business_id: businessId } });
    if (deleted.count === 0) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });

    // Remove o pump agendado da campanha, se houver
    try {
      await redisClient.del(PUMP_RUN_KEY(id));
    } catch {
      /* noop */
    }
    logger.info('Campanha excluída', { campaign_id: id });
    return ok(res, { message: 'Campanha excluída' });
  })
);

/** GET /campaigns/:id/stats — estatísticas. */
campaignsRouter.get(
  '/:id/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const campaign = await prisma.campaign.findFirst({ where: { id, business_id: businessId } });
    if (!campaign) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });
    const stats = await getCampaignStats(id, businessId);
    return ok(res, stats);
  })
);

/** Aceita "09:00" ou 9 → minutos desde a meia-noite. null = sem janela (envia sempre). */
function normalizeStartHour(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const h = Math.max(0, Math.min(23, Math.floor(value)));
    return h;
  }
  const str = String(value).trim();
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Math.max(0, Math.min(23, Number(m[1]))) * 60 + Math.max(0, Math.min(59, Number(m[2])));
  const n = Number(str);
  if (!Number.isNaN(n)) return Math.max(0, Math.min(23, Math.floor(n)));
  return null;
}

async function schedulePump(campaignId: string, businessId?: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  // Marca o runId corrente no Redis (coordena com o worker e evita pumps duplicados)
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await redisClient.set(PUMP_RUN_KEY(campaignId), runId);

  await getQueue(QUEUE_NAMES.CAMPAIGN_PROCESSING).add(
    'pump',
    { campaignId, runId, ...(businessId ? { businessId } : {}) },
    { jobId: `pump-${campaignId}-${runId}`, removeOnComplete: true, removeOnFail: true }
  );
}
