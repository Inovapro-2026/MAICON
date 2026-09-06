import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { startOfBrasiliaDay, startOfBrasiliaMonth } from "@prospector/utils";
import type { ToolDefinition, ToolResult } from "./index";
import { getDashboardMetrics } from "../dashboard-service";
import { getCampaignStats } from "../campaign-service";

const logger = createLogger("api.tools.savyron");

const PAGINATION_LIMIT = 50;

/**
 * Ferramentas de LEITURA do ecossistema SAVYRON — SOMENTE LEITURA.
 * Consultam leads, clientes (leads com conversas), campanhas, mensagens,
 * empresa, vendas e relatórios. Nenhuma escrita é feita aqui.
 */
export const SAVYRON_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description: "Panorama geral do negócio: leads disponíveis e importados, mensagens enviadas hoje/mês, respostas recebidas, interessados, não-interessados, opt-outs, erros e campanhas ativas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leads",
      description: "Lista leads do funil de vendas com filtros opcionais (status, segmento, busca por nome/telefone/e-mail). Use para 'quantos leads tenho?', 'mostre os leads interessados'.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PENDING", "PROCESSING", "SENT", "RESPONDED", "AGENT_ACTIVE", "INTERESTED", "NOT_INTERESTED", "OPT_OUT", "ERROR"], description: "Filtrar por status (opcional)" },
          segment: { type: "string", description: "Filtrar por segmento (opcional)" },
          query: { type: "string", description: "Busca por nome, telefone ou e-mail (opcional)" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 20, máximo 50)", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients",
      description: "Lista clientes (leads que possuem conversa). Use para 'quantos clientes tenho?', 'quais são meus clientes?'. Inclui resumo por estágio comercial.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Busca por nome, telefone ou e-mail (opcional)" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 20, máximo 50)", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaigns",
      description: "Lista campanhas da empresa com status, canal, limites diários e datas. Use para 'quais minhas campanhas?', 'quantas campanhas tenho?', 'qual campanha está ativa?'.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ACTIVE", "PAUSED", "FINISHED"], description: "Filtrar por status (opcional)" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 20, máximo 50)", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_status",
      description: "Detalha o desempenho de uma campanha específica: total de leads, processados, pendentes, enviados, respondidos, interessados, não-interessados, opt-outs, erros e progresso. Use para 'qual campanha teve melhor desempenho?', 'como está minha campanha?'.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "ID da campanha" },
        },
        required: ["campaign_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_last_messages",
      description: "Lista as últimas mensagens (recebidas e/ou enviadas) da empresa, com lead, canal e horário. Use para saber as interações mais recentes.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["IN", "OUT"], description: "Filtrar por direção (opcional)" },
          channel: { type: "string", enum: ["WHATSAPP", "EMAIL"], description: "Filtrar por canal (opcional)" },
          since: { type: "string", description: "Data ISO a partir da qual listar (opcional, padrão: últimos 7 dias)" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 10, máximo 50)", default: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_company",
      description: "Retorna o perfil da empresa (nome, razão social, CNPJ, segmento, descrição, e-mail, telefone e status).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Resumo de vendas (receitas) do mês atual e anterior: quantidade, valor total e ticket médio. Use para 'quanto vendi este mês?', 'quantas vendas tive?', 'qual meu ticket médio?'.",
      parameters: {
        type: "object",
        properties: {
          months_back: { type: "integer", description: "Quantos meses anteriores considerar (padrão 1: mês atual; 2: inclui mês anterior)", default: 1 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reports",
      description: "Relatório executivo do mês atual consolidando leads, mensagens, respostas, interessados, campanhas ativas, vendas (receitas), despesas e saldo. Use para 'como está meu negócio?', 'me dê um relatório do mês'.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export async function executeSavyronTool(
  name: string,
  businessId: string,
  _userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "get_dashboard_stats": {
      const metrics = await getDashboardMetrics(businessId);
      return { result: { metrics }, stateChanged: false };
    }

    case "get_leads": {
      const status = args.status ? String(args.status) : undefined;
      const segment = args.segment ? String(args.segment).trim() : undefined;
      const query = args.query ? String(args.query).trim() : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), PAGINATION_LIMIT);

      const where: any = { business_id: businessId };
      if (status) where.status = status;
      if (segment) where.segment = { contains: segment, mode: "insensitive" };
      if (query) {
        where.OR = [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
          { email: { contains: query, mode: "insensitive" } },
          { business_name: { contains: query, mode: "insensitive" } },
        ];
      }

      const leads = await prisma.lead.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit,
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
          source: true,
          lead_score: true,
          created_at: true,
        },
      });

      return {
        result: {
          count: leads.length,
          total: await prisma.lead.count({ where }),
          leads,
        },
        stateChanged: false,
      };
    }

    case "get_clients": {
      const query = args.query ? String(args.query).trim() : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), PAGINATION_LIMIT);

      const leadWhere: any = {
        business_id: businessId,
        conversations: { some: {} },
      };
      if (query) {
        leadWhere.OR = [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
          { email: { contains: query, mode: "insensitive" } },
          { business_name: { contains: query, mode: "insensitive" } },
        ];
      }

      const clients = await prisma.lead.findMany({
        where: leadWhere,
        orderBy: { created_at: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          business_name: true,
          city: true,
          state: true,
          created_at: true,
          conversations: { select: { id: true, status: true, stage: true, last_message_at: true } },
        },
      });

      const stageRows = await prisma.conversation.groupBy({
        by: ["stage"],
        where: { business_id: businessId },
        _count: { _all: true },
      });
      const openConversations = await prisma.conversation.count({
        where: { business_id: businessId, status: "OPEN" },
      });

      return {
        result: {
          clients,
          count: clients.length,
          total: await prisma.lead.count({ where: leadWhere }),
          summary: {
            conversations_by_stage: stageRows.map(r => ({ stage: r.stage, count: r._count._all })),
            open_conversations: openConversations,
          },
        },
        stateChanged: false,
      };
    }

    case "get_campaigns": {
      const status = args.status ? String(args.status) : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), PAGINATION_LIMIT);

      const where: any = { business_id: businessId };
      if (status) where.status = status;

      const campaigns = await prisma.campaign.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          channel_mode: true,
          daily_whatsapp_limit: true,
          daily_email_limit: true,
          interval_seconds: true,
          is_test: true,
          start_hour: true,
          created_at: true,
        },
      });

      return {
        result: {
          count: campaigns.length,
          total: await prisma.campaign.count({ where }),
          campaigns,
        },
        stateChanged: false,
      };
    }

    case "get_campaign_status": {
      const campaignId = String(args.campaign_id ?? "").trim();
      if (!campaignId) return { result: { error: "ID da campanha é obrigatório" }, stateChanged: false };

      const stats = await getCampaignStats(campaignId, businessId);
      return { result: { campaign_id: campaignId, stats }, stateChanged: false };
    }

    case "get_last_messages": {
      const direction = args.direction ? String(args.direction) : undefined;
      const channel = args.channel ? String(args.channel) : undefined;
      const since = args.since ? new Date(String(args.since)) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), PAGINATION_LIMIT);

      const where: any = {
        business_id: businessId,
        created_at: { gte: since },
      };
      if (direction) where.direction = direction;
      if (channel) where.channel = channel;

      const messages = await prisma.message.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit,
        select: {
          id: true,
          lead: { select: { id: true, name: true, phone: true } },
          campaign_id: true,
          channel: true,
          direction: true,
          content: true,
          status: true,
          created_at: true,
        },
      });

      return { result: { since: since.toISOString(), count: messages.length, messages }, stateChanged: false };
    }

    case "get_company": {
      const company = await prisma.business.findFirst({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          legal_name: true,
          trade_name: true,
          cnpj: true,
          segment: true,
          description: true,
          email: true,
          phone: true,
          status: true,
          created_at: true,
        },
      });

      if (!company) return { result: { error: "Empresa não encontrada" }, stateChanged: false };
      return { result: { company }, stateChanged: false };
    }

    case "get_sales_summary": {
      const monthsBack = Math.min(Math.max(Number(args.months_back) || 1, 1), 24);
      const now = new Date();

      const periods = Array.from({ length: monthsBack }, (_, i) => {
        const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
        const end = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i) + 1, 0, 23, 59, 59);
        return { start, end, label: `${start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}` };
      });

      const months: Array<{ label: string; sales_count: number; revenue: number }> = [];

      for (const p of periods) {
        const aggregate = await prisma.financialTransaction.aggregate({
          where: {
            business_id: businessId,
            type: "INCOME",
            status: { in: ["REAL", "PLANNED"] },
            date: { gte: p.start, lte: p.end },
          },
          _sum: { amount: true },
          _count: true,
        });
        const revenue = Number(aggregate._sum.amount || 0);
        months.push({
          label: p.label,
          sales_count: aggregate._count,
          revenue,
        });
      }

      const current = months[months.length - 1];

      return {
        result: {
          current_month: { label: current.label, sales_count: current.sales_count, revenue: current.revenue },
          ticket_medio: current.sales_count > 0 ? Math.round((current.revenue / current.sales_count) * 100) / 100 : 0,
          months,
          note: "Vendas consideram receitas (lançamentos INCOME). Suposições devem ser tratadas como ESTIMATIVA.",
        },
        stateChanged: false,
      };
    }

    case "get_reports": {
      const today = startOfBrasiliaDay(new Date());
      const monthStart = startOfBrasiliaMonth(new Date());
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);

      const metrics = await getDashboardMetrics(businessId);

      const [incomeAgg, expenseAgg, leadStatuses, conversationsByStage, activeCampaigns, whatsappSentMonth, emailSentMonth] = await Promise.all([
        prisma.financialTransaction.aggregate({
          where: { business_id: businessId, type: "INCOME", date: { gte: monthStart, lte: monthEnd }, status: { in: ["REAL", "PLANNED"] } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.financialTransaction.aggregate({
          where: { business_id: businessId, type: "EXPENSE", date: { gte: monthStart, lte: monthEnd }, status: { in: ["REAL", "PLANNED"] } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.lead.groupBy({
          by: ["status"],
          where: { business_id: businessId },
          _count: { _all: true },
        }),
        prisma.conversation.groupBy({
          by: ["stage"],
          where: { business_id: businessId },
          _count: { _all: true },
        }),
        prisma.campaign.findMany({
          where: { business_id: businessId, status: "ACTIVE" },
          select: { id: true, name: true },
        }),
        prisma.message.count({
          where: { business_id: businessId, channel: "WHATSAPP", direction: "OUT", created_at: { gte: monthStart }, status: { in: ["SENT", "DELIVERED", "READ"] } },
        }),
        prisma.message.count({
          where: { business_id: businessId, channel: "EMAIL", direction: "OUT", created_at: { gte: monthStart }, status: { in: ["SENT", "DELIVERED", "READ"] } },
        }),
      ]);

      const revenue = Number(incomeAgg._sum.amount || 0);
      const expenses = Number(expenseAgg._sum.amount || 0);

      return {
        result: {
          period: { start: monthStart.toISOString(), end: monthEnd.toISOString(), label: `${monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}` },
          leads: {
            imported_total: metrics.leads_imported,
            available: metrics.leads_available,
            by_status: leadStatuses.map(r => ({ status: r.status, count: r._count._all })),
            interested: metrics.interested,
            not_interested: metrics.not_interested,
            errors: metrics.errors,
            opt_outs: metrics.opt_outs,
          },
          messages: {
            sent_month_total: metrics.messages_sent_month,
            whatsapp_sent_month: whatsappSentMonth,
            email_sent_month: emailSentMonth,
            sent_today: metrics.messages_sent_today,
            responses_received_month: metrics.responses_received_month,
            responses_received_today: metrics.responses_received,
          },
          conversations: {
            by_stage: conversationsByStage.map(r => ({ stage: r.stage, count: r._count._all })),
          },
          campaigns: {
            active: activeCampaigns,
            active_count: activeCampaigns.length,
          },
          financial: {
            revenue,
            sales_count: incomeAgg._count,
            expenses,
            balance: revenue - expenses,
            current_balance_note: "Saldo do período = vendas - despesas. Dados reais e previstos combinados.",
          },
          dashboard_metrics: metrics,
          note: "Relatório consolidado do mês. Dados de projeção devem ser tratados como ESTIMATIVA.",
        },
        stateChanged: false,
      };
    }

    default:
      logger.warn("Operação não permitida no modo somente leitura", { name, business_id: businessId });
      return {
        result: { error: "Modo somente leitura: a aba Agente não pode alterar dados do SAVYRON." },
        stateChanged: false,
      };
  }
}