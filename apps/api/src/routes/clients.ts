import { Router, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth, requireBusiness } from "../middleware/auth";

const logger = createLogger("api.clients");

/**
 * CLIENTES — a entidade Cliente é o próprio `Lead` (não duplica dados): um
 * telefone = um cliente por tenant (business_id). Um cliente é um lead que já
 * possui ao menos uma conversa. Memória (nome, segmento, status) é isolada por
 * business_id — nunca uma query sem `WHERE business_id`.
 */
export const clientsRouter = Router();

clientsRouter.use(requireAuth, requireBusiness);

const METRICS_WINDOW_DAYS = 30;
const DAY_NAMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const DAY_KEYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_KEYS_ASCII = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/**
 * GET /clients/metrics — métricas de atendimento (últimos 30 dias):
 * total de clientes, respostas recebidas, mensagens enviadas, tempo médio de
 * resposta e análise de demanda (dia/horário de pico + distribuição p/ gráficos).
 * Tudo filtrado por business_id (multi-tenant) e no fuso da empresa.
 */
clientsRouter.get(
  "/metrics",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const cutoff = new Date(
      Date.now() - METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [businessSettings, totalClients, messages] = await Promise.all([
      prisma.businessSettings.findUnique({ where: { business_id: businessId } }),
      prisma.lead.count({
        where: { business_id: businessId, conversations: { some: {} } },
      }),
      prisma.message.findMany({
        where: { business_id: businessId, created_at: { gte: cutoff } },
        select: { lead_id: true, direction: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
    ]);

    const timezone = businessSettings?.timezone ?? "America/Sao_Paulo";
    const dayFmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      weekday: "short",
    });
    const hourFmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    });

    const byDay = new Array(7).fill(0) as number[];
    const byHour = new Array(24).fill(0) as number[];
    const buckets: Record<string, { lastIn: number | null; gaps: number[] }> = {};
    let totalResponses = 0;
    let totalSent = 0;

    for (const m of messages) {
      if (m.direction === "IN") totalResponses++;
      else totalSent++;

      // Dia da semana no fuso da empresa (ex.: "seg." → índice 1).
      const dayKey = dayFmt
        .format(m.created_at)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\./g, "");
      const dayIndex = DAY_KEYS_ASCII.indexOf(dayKey);
      byDay[dayIndex >= 0 ? dayIndex : m.created_at.getUTCDay()]++;

      // Horário no fuso da empresa (ex.: "14" → hora 14).
      const hour = Number(hourFmt.format(m.created_at));
      byHour[!Number.isNaN(hour) && hour >= 0 && hour <= 23 ? hour : m.created_at.getUTCHours()]++;

      // Tempo de resposta: cada IN é pareado com a próxima OUT do mesmo lead.
      const bucket = (buckets[m.lead_id] ??= { lastIn: null, gaps: [] });
      if (m.direction === "IN") {
        bucket.lastIn = m.created_at.getTime();
      } else if (bucket.lastIn != null) {
        bucket.gaps.push(m.created_at.getTime() - bucket.lastIn);
        bucket.lastIn = null;
      }
    }

    const allGaps = Object.values(buckets).flatMap((b) => b.gaps);
    const averageResponseTime = allGaps.length
      ? Math.round((allGaps.reduce((a, b) => a + b, 0) / allGaps.length) / 100) / 10
      : 0;

    const total = totalResponses + totalSent;
    const peakDayIndex = byDay.indexOf(Math.max(...byDay));
    const peakHourIndex = byHour.indexOf(Math.max(...byHour));

    return ok(res, {
      windowDays: METRICS_WINDOW_DAYS,
      totalClients,
      metrics: {
        totalResponses,
        totalSent,
        totalMessages: total,
        averageResponseTime,
      },
      peakDay: total
        ? { key: DAY_KEYS[peakDayIndex], label: DAY_NAMES[peakDayIndex], count: byDay[peakDayIndex] }
        : null,
      peakHour: total
        ? {
            hour: peakHourIndex,
            label: `${peakHourIndex}h`,
            count: byHour[peakHourIndex],
            percentage: Math.round((byHour[peakHourIndex] / total) * 100),
          }
        : null,
      charts: {
        byDay: byDay.map((count, i) => ({ key: DAY_KEYS[i], label: DAY_NAMES[i], count })),
        byHour: byHour.map((count, hour) => ({ hour, label: `${hour}h`, count })),
      },
    });
  }),
);

/** GET /clients — lista clientes (leads com conversa) com busca e paginação. */
clientsRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Number(req.query.pageSize ?? 24));
    const search = String(req.query.search ?? "").trim();

    const where: Record<string, unknown> = {
      business_id: businessId,
      conversations: { some: {} },
    };
    if (search) {
      const like = { contains: search, mode: "insensitive" as const };
      where.OR = [
        { name: like },
        { phone: like },
        { segment: like },
        { business_name: like },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          segment: true,
          business_name: true,
          status: true,
          updated_at: true,
          _count: { select: { messages: true } },
          conversations: {
            select: { id: true, stage: true, status: true, last_message_at: true },
          },
        },
      }),
    ]);

    const clients = leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      segment: l.segment,
      business_name: l.business_name,
      status: l.status,
      message_count: l._count.messages,
      last_activity: l.conversations[0]?.last_message_at ?? l.updated_at,
      conversation: l.conversations[0] ?? null,
    }));

    logger.debug("Clientes listados", { business_id: businessId, total, page, pageSize });
    return ok(res, { total, page, pageSize, clients });
  })
);

/** GET /clients/:id — detalhe do cliente (sempre filtrado por business_id). */
clientsRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const client = await prisma.lead.findFirst({
      where: { id, business_id: businessId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        business_name: true,
        city: true,
        state: true,
        segment: true,
        status: true,
        created_at: true,
        updated_at: true,
        conversations: {
          select: { id: true, stage: true, status: true, last_message_at: true },
        },
      },
    });
    if (!client) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Cliente não encontrado" },
      });
    }
    return ok(res, client);
  })
);

/**
 * GET /clients/:id/conversation — abre a conversa EXISTENTE do cliente.
 * NUNCA cria uma conversa a partir deste clique: se não houver vínculo,
 * retorna 404 (a UI mostra "Nenhuma conversa vinculada").
 */
clientsRouter.get(
  "/:id/conversation",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);
    const conversation = await prisma.conversation.findFirst({
      where: { business_id: businessId, lead_id: id },
      select: { id: true },
    });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Nenhuma conversa vinculada a este cliente" },
      });
    }
    return ok(res, { conversationId: conversation.id });
  })
);