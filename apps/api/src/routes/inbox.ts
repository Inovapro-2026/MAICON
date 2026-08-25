import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { asyncHandler, ok } from '../lib/http';
import { requireAuth, requireBusiness, requireRole } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/active-subscription';
import { getQueue } from '../services/queues';
import { realtimeService, buildEvent } from '../services/realtime';
import { listConversations, getConversationDetail, InboxFilter } from '../services/conversation-service';
import { deleteConversation, deleteAllConversations } from '../services/deletion-service';

const logger = createLogger('api.inbox');

export const inboxRouter = Router();

inboxRouter.use(requireAuth, requireBusiness);

/** GET /conversations — lista conversas com filtros. */
inboxRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const filter = (req.query.filter as InboxFilter) || 'all';
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Number(req.query.pageSize ?? 20));
    const result = await listConversations(filter, page, pageSize, businessId);
    return ok(res, result);
  })
);

/** GET /conversations/:id — detalhe com histórico completo. */
inboxRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const conversation = await getConversationDetail(String(req.params.id), businessId);
    if (!conversation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } });
    return ok(res, conversation);
  })
);

/** POST /conversations/:id/takeover — humano assume o atendimento. */
inboxRouter.post(
  '/:id/takeover',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const conversation = await prisma.conversation.findFirst({ where: { id, business_id: businessId } });
    if (!conversation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } });

    await prisma.$transaction([
      prisma.conversation.update({ where: { id }, data: { human_handled: true } }),
      prisma.lead.update({ where: { id: conversation.lead_id }, data: { status: 'AGENT_ACTIVE' } }),
    ]);

    realtimeService.emit(buildEvent('status_changed', id, conversation.lead_id, { lead_status: 'AGENT_ACTIVE', human_handled: true }, businessId));

    logger.info('Conversa assumida por humano', { conversation_id: id });
    return ok(res, { message: 'Conversa assumida. Você está no modo manual.' });
  })
);

/** POST /conversations/:id/release — devolve para a IA. */
inboxRouter.post(
  '/:id/release',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const conversation = await prisma.conversation.findFirst({ where: { id, business_id: businessId } });
    if (!conversation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } });

    await prisma.$transaction([
      prisma.conversation.update({ where: { id }, data: { human_handled: false } }),
      prisma.lead.update({ where: { id: conversation.lead_id }, data: { status: 'RESPONDED' } }),
    ]);

    realtimeService.emit(buildEvent('status_changed', id, conversation.lead_id, { lead_status: 'RESPONDED', human_handled: false }, businessId));

    logger.info('Conversa devolvida para a IA', { conversation_id: id });
    return ok(res, { message: 'Conversa devolvida para a IA' });
  })
);

/** POST /conversations/:id/message — envio manual (humano). */
inboxRouter.post(
  '/:id/message',
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const content = String(req.body?.content ?? '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Informe o conteúdo da mensagem' } });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, business_id: businessId },
      include: { lead: true },
    });
    if (!conversation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } });

    const lastOutbound = await prisma.message.findFirst({
      where: { lead_id: conversation.lead_id, business_id: businessId, direction: 'OUT' },
      orderBy: { created_at: 'desc' },
    });

    const channel = lastOutbound?.channel ?? (conversation.lead.phone ? 'WHATSAPP' : 'EMAIL');

    const message = await prisma.message.create({
      data: {
        business_id: businessId,
        lead_id: conversation.lead_id,
        channel,
        direction: 'OUT',
        content,
        status: 'QUEUED',
        provider: 'MANUAL',
      },
    });

    await prisma.$transaction([
      prisma.conversation.update({ where: { id }, data: { last_message_at: new Date() } }),
      prisma.lead.update({ where: { id: conversation.lead_id }, data: { status: 'AGENT_ACTIVE' } }),
    ]);

    realtimeService.emit(buildEvent('status_changed', id, conversation.lead_id, { lead_status: 'AGENT_ACTIVE', human_handled: false, content, direction: 'OUT' }, businessId));

    const queue = channel === 'WHATSAPP' ? QUEUE_NAMES.WHATSAPP_SEND : QUEUE_NAMES.EMAIL_SEND;
    await getQueue(queue).add('send', {
      campaignLeadId: undefined,
      leadId: conversation.lead_id,
      campaignId: undefined,
      phone: conversation.lead.phone ?? '',
      email: conversation.lead.email ?? '',
      message: content,
      subject: 'Re: SAVYRON',
      manual: true,
      messageId: message.id,
      businessId,
    });

    logger.info('Mensagem manual enfileirada', { conversation_id: id, channel, message_id: message.id });
    return ok(res, { message: 'Mensagem enviada', messageId: message.id }, 202);
  })
);

/** POST /conversations/:id/close — encerra conversa. */
inboxRouter.post(
  '/:id/close',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const conversation = await prisma.conversation.findFirst({ where: { id, business_id: businessId } });
    if (!conversation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversa não encontrada' } });

    await prisma.conversation.update({ where: { id }, data: { status: 'CLOSED' } });
    realtimeService.emit(buildEvent('status_changed', id, conversation.lead_id, { lead_status: 'CLOSED' }, businessId));
    logger.info('Conversa encerrada', { conversation_id: id });
    return ok(res, { message: 'Conversa encerrada' });
  })
);

/**
 * DELETE /conversations — apaga TODAS as conversas da empresa atual.
 * Ação destrutiva de alto risco: restrita a OWNER/BUSINESS_ADMIN, com
 * confirmação reforçada na UI e registro em AuditLog.
 */
inboxRouter.delete(
  '/',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const result = await deleteAllConversations(businessId, { sub: req.user!.sub });
    logger.warn('Todas as conversas foram apagadas', {
      business_id: businessId,
      ...result,
    });
    return ok(res, result);
  })
);

/**
 * DELETE /conversations/:id — apaga UMA conversa (e histórico de mensagens do lead).
 * Qualquer membro com acesso à empresa pode excluir conversas individuais.
 */
inboxRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const result = await deleteConversation(businessId, id, { sub: req.user!.sub });
    logger.info('Conversa excluída', { conversation_id: id });
    return ok(res, result);
  })
);
