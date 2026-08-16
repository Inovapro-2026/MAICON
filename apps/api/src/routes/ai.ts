import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok, ApiError } from '../lib/http';
import { requireAuth, requireBusiness, requireRole } from '../middleware/auth';
import { writeAudit } from '../services/audit';
import { AgentContext } from '@prospector/types';
import {
  providerManager,
  generateCommercialTurn,
  loadAIConfiguration,
  COMMERCIAL_STAGES,
  CommercialStageValue,
} from '@prospector/ai';

const logger = createLogger('api.ai');

export const aiRouter = Router();

aiRouter.use(requireAuth, requireBusiness);

const TONES = ['PROFESSIONAL', 'FRIENDLY', 'CASUAL', 'RELAXED', 'PREMIUM', 'CONSULTATIVE', 'TECHNICAL'];
const CATEGORIES = ['PRODUCTS', 'SERVICES', 'PRICES', 'HOURS', 'POLICIES', 'FAQ', 'ADDRESS', 'PAYMENT', 'INTERNAL_RULES'];

// ---------------------------------------------------------------------------
// Agentes
// ---------------------------------------------------------------------------

/** GET /ai/agents — agentes da empresa ativa. */
aiRouter.get(
  '/agents',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const agents = await prisma.aIAgent.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: 'asc' },
    });
    return ok(res, { agents });
  })
);

/** POST /ai/agents — cria agente (OWNER/BUSINESS_ADMIN). */
aiRouter.post(
  '/agents',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const { name, role, description, active } = req.body ?? {};
    if (!name || !String(name).trim()) throw ApiError.badRequest('Informe o nome do agente');
    const agent = await prisma.aIAgent.create({
      data: {
        business_id: businessId,
        name: String(name).slice(0, 120),
        role: role ? String(role).slice(0, 120) : undefined,
        description: description ? String(description).slice(0, 2000) : undefined,
        active: active !== false,
      },
    });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.agent.created', entity: 'AIAgent', entityId: agent.id });
    return ok(res, agent, 201);
  })
);

/** PATCH /ai/agents/:id — atualiza agente (OWNER/BUSINESS_ADMIN). */
aiRouter.patch(
  '/agents/:id',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const agent = await prisma.aIAgent.findFirst({ where: { id, business_id: businessId } });
    if (!agent) throw ApiError.notFound('Agente não encontrado');
    const { name, role, description, active } = req.body ?? {};
    const updated = await prisma.aIAgent.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).slice(0, 120) } : {}),
        ...(role !== undefined ? { role: role ? String(role).slice(0, 120) : null } : {}),
        ...(description !== undefined ? { description: description ? String(description).slice(0, 2000) : null } : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
      },
    });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.agent.updated', entity: 'AIAgent', entityId: id });
    return ok(res, updated);
  })
);

/** DELETE /ai/agents/:id — remove agente (OWNER/BUSINESS_ADMIN). */
aiRouter.delete(
  '/agents/:id',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const agent = await prisma.aIAgent.findFirst({ where: { id, business_id: businessId } });
    if (!agent) throw ApiError.notFound('Agente não encontrado');
    await prisma.aIAgent.delete({ where: { id } });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.agent.deleted', entity: 'AIAgent', entityId: id });
    return ok(res, { deleted: true });
  })
);

// ---------------------------------------------------------------------------
// Configurações da IA (AISettings)
// ---------------------------------------------------------------------------

function normalizeAISettings(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  if (body.tone !== undefined) {
    const tone = String(body.tone).toUpperCase();
    if (!TONES.includes(tone)) throw ApiError.badRequest('Tom de voz inválido');
    data.tone = tone;
  }
  if (body.agent_id !== undefined) data.agent_id = body.agent_id || null;
  if (body.behaviors !== undefined) data.behaviors = body.behaviors;
  if (body.message_config !== undefined) data.message_config = body.message_config;
  if (body.custom_prompt !== undefined) data.custom_prompt = body.custom_prompt ? String(body.custom_prompt).slice(0, 20000) : null;
  return data;
}

/** GET /ai/settings — configuração de IA da empresa (cria default se ausente). */
aiRouter.get(
  '/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    let settings = await prisma.aISettings.findUnique({ where: { business_id: businessId } });
    if (!settings) {
      settings = await prisma.aISettings.create({ data: { business_id: businessId } });
    }
    const agent = settings.agent_id
      ? await prisma.aIAgent.findUnique({ where: { id: settings.agent_id } })
      : null;
    return ok(res, {
      ...settings,
      tone: settings.tone,
      behaviors: settings.behaviors as Record<string, boolean>,
      message_config: settings.message_config as Record<string, unknown>,
      agent,
    });
  })
);

/** PATCH /ai/settings — atualiza configuração (OWNER/BUSINESS_ADMIN). */
aiRouter.patch(
  '/settings',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const data = normalizeAISettings(req.body ?? {});
    const settings = await prisma.aISettings.upsert({
      where: { business_id: businessId },
      update: data,
      create: { business_id: businessId, ...data },
    });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.settings.updated', entity: 'AISettings', entityId: settings.id });
    return ok(res, settings);
  })
);

// ---------------------------------------------------------------------------
// Base de conhecimento
// ---------------------------------------------------------------------------

/** GET /ai/knowledge — itens de conhecimento da empresa. */
aiRouter.get(
  '/knowledge',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const items = await prisma.aIKnowledge.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: 'desc' },
    });
    return ok(res, { items });
  })
);

/** POST /ai/knowledge — cria item (OWNER/BUSINESS_ADMIN). */
aiRouter.post(
  '/knowledge',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const { title, content, category, active } = req.body ?? {};
    if (!title || !String(title).trim()) throw ApiError.badRequest('Informe o título');
    if (!content || !String(content).trim()) throw ApiError.badRequest('Informe o conteúdo');
    const cat = String(category ?? 'FAQ').toUpperCase();
    if (!CATEGORIES.includes(cat)) throw ApiError.badRequest('Categoria inválida');
    const item = await prisma.aIKnowledge.create({
      data: {
        business_id: businessId,
        title: String(title).slice(0, 200),
        content: String(content).slice(0, 10000),
        category: cat as never,
        active: active !== false,
      },
    });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.knowledge.created', entity: 'AIKnowledge', entityId: item.id });
    return ok(res, item, 201);
  })
);

/** PATCH /ai/knowledge/:id — atualiza item (OWNER/BUSINESS_ADMIN). */
aiRouter.patch(
  '/knowledge/:id',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const existing = await prisma.aIKnowledge.findFirst({ where: { id, business_id: businessId } });
    if (!existing) throw ApiError.notFound('Item não encontrado');
    const { title, content, category, active } = req.body ?? {};
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = String(title).slice(0, 200);
    if (content !== undefined) data.content = String(content).slice(0, 10000);
    if (category !== undefined) {
      const cat = String(category).toUpperCase();
      if (!CATEGORIES.includes(cat)) throw ApiError.badRequest('Categoria inválida');
      data.category = cat;
    }
    if (active !== undefined) data.active = Boolean(active);
    const updated = await prisma.aIKnowledge.update({ where: { id }, data });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.knowledge.updated', entity: 'AIKnowledge', entityId: id });
    return ok(res, updated);
  })
);

/** DELETE /ai/knowledge/:id — remove item (OWNER/BUSINESS_ADMIN). */
aiRouter.delete(
  '/knowledge/:id',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const existing = await prisma.aIKnowledge.findFirst({ where: { id, business_id: businessId } });
    if (!existing) throw ApiError.notFound('Item não encontrado');
    await prisma.aIKnowledge.delete({ where: { id } });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.knowledge.deleted', entity: 'AIKnowledge', entityId: id });
    return ok(res, { deleted: true });
  })
);

// ---------------------------------------------------------------------------
// Playground (teste isolado — NUNCA envia para WhatsApp/e-mail reais)
// ---------------------------------------------------------------------------

/** GET /ai/playground/status — indica se há provider configurado. */
aiRouter.get(
  '/playground/status',
  asyncHandler(async (_req: Request, res: Response) => {
    return ok(res, { available: providerManager.isAvailable(), provider: providerManager.getPrimary() ?? null });
  })
);

/**
 * POST /ai/playground — chat de teste isolado que usa o MESMO caminho do
 * WhatsApp real: `generateCommercialTurn` (Motor Comercial Global + camadas de
 * prompt + saída estruturada). Mantém o histórico da conversa para a IA evoluir
 * o estágio comercial turno a turno. Ambiente 100% isolado: não enfileira
 * mensagens nem envia para WhatsApp/e-mail reais.
 */
aiRouter.post(
  '/playground',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    // Histórico da conversa (mais antigo → mais novo), com a última sempre "user".
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = raw
      .slice(0, 30)
      .map((m: { role?: string; content?: string }) => ({
        role: m?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m?.content ?? '').slice(0, 4000),
      }))
      .filter((m: { content: string }) => m.content.trim());
    if (messages.length === 0) throw ApiError.badRequest('Digite uma mensagem para testar');

    // Mesma fonte de verdade do WhatsApp real (worker): Business + Settings +
    // Agent + Knowledge, tudo filtrado por businessId.
    const agentConfig = await loadAIConfiguration(prisma, businessId);

    // Estágio comercial atual informado pela UI (avança turno a turno).
    const stage = COMMERCIAL_STAGES.includes(req.body?.stage as CommercialStageValue)
      ? (req.body.stage as CommercialStageValue)
      : undefined;

    const context: AgentContext = {
      leadName: null,
      businessName: null,
      city: null,
      state: null,
      history: messages,
      contactType: 'novo',
      conversationStage: stage ?? null,
    };

    const result = await generateCommercialTurn(context, {
      agentConfig,
      maxTokens: 600,
      timeoutMs: 30000,
    });

    const settings = await prisma.aISettings.findUnique({ where: { business_id: businessId } });
    void writeAudit({ actor: req.user!.sub, businessId, action: 'ai.playground.used', entity: 'AISettings', entityId: settings?.id });

    return ok(res, {
      reply: result.reply,
      stage: result.conversation.stage,
      technique_used: result.technique_used,
      action: result.action,
      intent: result.intent,
      known: result.known,
      goal: result.goal,
      next_action: result.next_action,
      structured: result.structured,
      agent: agentConfig.agent?.name ? { id: settings?.agent_id ?? null, name: agentConfig.agent.name } : null,
      provider: result.provider,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms: result.latencyMs,
    });
  })
);