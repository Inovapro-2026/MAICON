import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import type { ToolDefinition, ToolResult } from "./index";

const logger = createLogger("api.tools.projections");

export const PROJECTION_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "project_month",
      description: "Projeta o faturamento, despesas e resultado para o próximo mês ou meses seguintes. Analisa dados históricos, campanhas, leads e tendências. Use para responder 'qual a projeção para o próximo mês?', 'quanto vou faturar mês que vem?'.",
      parameters: {
        type: "object",
        properties: {
          months_ahead: { type: "integer", description: "Quantos meses à frente (padrão 1, máximo 6)", default: 1 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_expenses",
      description: "Projeta os gastos futuros baseados em despesas recorrentes, histórico de gastos e despesas previstas. Use para 'quanto vou gastar mês que vem?'.",
      parameters: {
        type: "object",
        properties: {
          months_ahead: { type: "integer", description: "Quantos meses à frente (padrão 1, máximo 6)", default: 1 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_income",
      description: "Projeta as receitas futuras baseadas em receitas recorrentes, histórico e receitas previstas.",
      parameters: {
        type: "object",
        properties: {
          months_ahead: { type: "integer", description: "Quantos meses à frente (padrão 1, máximo 6)", default: 1 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_sales",
      description: "Analisa o desempenho de vendas, campanhas e leads para projetar vendas futuras. Use para 'como estão minhas vendas?', 'minha campanha está funcionando?', 'vou bater a meta de vendas?'.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "ID da campanha específica (opcional)" },
        },
      },
    },
  },
];

export async function executeProjectionTool(
  name: string,
  businessId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "project_month": {
      const monthsAhead = Math.min(Math.max(Number(args.months_ahead) || 1, 1), 6);
      const now = new Date();
      const currentMonth = { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
      const lastMonth = { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };

      const lastMonthIncomes = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, type: "INCOME", date: { gte: lastMonth.start, lte: lastMonth.end }, status: "REAL" as any },
        _sum: { amount: true },
      });

      const currentMonthIncomes = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, type: "INCOME", date: { gte: currentMonth.start, lte: currentMonth.end }, status: { in: ["REAL", "PLANNED"] as any } },
        _sum: { amount: true },
      });

      const lastMonthExpenses = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, type: "EXPENSE", date: { gte: lastMonth.start, lte: lastMonth.end }, status: "REAL" as any },
        _sum: { amount: true },
      });

      const currentMonthExpenses = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, type: "EXPENSE", date: { gte: currentMonth.start, lte: currentMonth.end }, status: { in: ["REAL", "PLANNED"] as any } },
        _sum: { amount: true },
      });

      const lastMonthRevenue = Number(lastMonthIncomes._sum.amount || 0);
      const currentRevenue = Number(currentMonthIncomes._sum.amount || 0);
      const lastMonthCost = Number(lastMonthExpenses._sum.amount || 0);
      const currentCost = Number(currentMonthExpenses._sum.amount || 0);

      const growthRate = lastMonthRevenue > 0 ? ((currentRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 10;

      const campaignStats = await prisma.campaignLead.aggregate({
        where: { business_id: businessId, campaign: { business_id: businessId } },
        _count: true,
        _max: { created_at: true },
      });

      const monthlyProjections = [];
      for (let m = 1; m <= monthsAhead; m++) {
        const projectedRevenue = currentRevenue * Math.pow(1 + growthRate / 100, m);
        const projectedCost = currentCost * Math.pow(1 + (growthRate / 2) / 100, m);
        monthlyProjections.push({
          month: m,
          projected_revenue: Math.round(projectedRevenue * 100) / 100,
          projected_expenses: Math.round(projectedCost * 100) / 100,
          projected_result: Math.round((projectedRevenue - projectedCost) * 100) / 100,
        });
      }

      return {
        result: {
          current_month: { revenue: currentRevenue, expenses: currentCost, result: currentRevenue - currentCost },
          last_month: { revenue: lastMonthRevenue, expenses: lastMonthCost, result: lastMonthRevenue - lastMonthCost },
          growth_rate_percent: Math.round(growthRate * 100) / 100,
          projections: monthlyProjections,
          campaigns_total_leads: campaignStats._count,
          note: "Projeção baseada em dados financeiros e tendência de crescimento. Valores reais podem variar.",
        },
        stateChanged: false,
      };
    }

    case "project_expenses": {
      const monthsAhead = Math.min(Math.max(Number(args.months_ahead) || 1, 1), 6);
      const now = new Date();
      const months = [];

      for (let m = 0; m < monthsAhead; m++) {
        const start = new Date(now.getFullYear(), now.getMonth() + 1 + m, 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 2 + m, 0, 23, 59, 59);

        const recurring = await prisma.financialTransaction.findMany({
          where: { business_id: businessId, type: "EXPENSE", recurrence: { not: "NONE" as any }, status: { not: "CANCELLED" as any } },
          select: { description: true, amount: true, recurrence: true },
        });

        const planned = await prisma.financialTransaction.aggregate({
          where: { business_id: businessId, type: "EXPENSE", date: { gte: start, lte: end }, status: "PLANNED" as any },
          _sum: { amount: true },
          _count: true,
        });

        let recurringTotal = 0;
        const recurringItems = recurring.map(r => {
          const amount = Number(r.amount);
          if (r.recurrence === "MONTHLY") { recurringTotal += amount; return { description: r.description, amount, type: "mensal" }; }
          return null;
        }).filter(Boolean);

        months.push({
          month: m + 1,
          month_name: start.toLocaleString("pt-BR", { month: "long", year: "numeric" }),
          recurring_expenses: { total: Math.round(recurringTotal * 100) / 100, items: recurringItems },
          planned_expenses: { total: Math.round(Number(planned._sum.amount || 0) * 100) / 100, count: planned._count },
          total_projected: Math.round((recurringTotal + Number(planned._sum.amount || 0)) * 100) / 100,
        });
      }

      return {
        result: {
          projection_months: months,
          note: "Projeção de despesas baseada em gastos recorrentes e valores previstos. Despesas não registradas não estão incluídas.",
        },
        stateChanged: false,
      };
    }

    case "project_income": {
      const monthsAhead = Math.min(Math.max(Number(args.months_ahead) || 1, 1), 6);
      const now = new Date();
      const months = [];

      for (let m = 0; m < monthsAhead; m++) {
        const start = new Date(now.getFullYear(), now.getMonth() + 1 + m, 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 2 + m, 0, 23, 59, 59);

        const recurring = await prisma.financialTransaction.findMany({
          where: { business_id: businessId, type: "INCOME", recurrence: { not: "NONE" as any }, status: { not: "CANCELLED" as any } },
          select: { description: true, amount: true, recurrence: true },
        });

        const planned = await prisma.financialTransaction.aggregate({
          where: { business_id: businessId, type: "INCOME", date: { gte: start, lte: end }, status: "PLANNED" as any },
          _sum: { amount: true },
          _count: true,
        });

        let recurringTotal = 0;
        const recurringItems = recurring.map(r => {
          const amount = Number(r.amount);
          if (r.recurrence === "MONTHLY") { recurringTotal += amount; return { description: r.description, amount, type: "mensal" }; }
          return null;
        }).filter(Boolean);

        months.push({
          month: m + 1,
          month_name: start.toLocaleString("pt-BR", { month: "long", year: "numeric" }),
          recurring_income: { total: Math.round(recurringTotal * 100) / 100, items: recurringItems },
          planned_income: { total: Math.round(Number(planned._sum.amount || 0) * 100) / 100, count: planned._count },
          total_projected: Math.round((recurringTotal + Number(planned._sum.amount || 0)) * 100) / 100,
        });
      }

      return {
        result: {
          projection_months: months,
          note: "Projeção de receitas baseada em ganhos recorrentes e valores previstos. Receitas não registradas não estão incluídas.",
        },
        stateChanged: false,
      };
    }

    case "project_sales": {
      const campaignId = args.campaign_id ? String(args.campaign_id).trim() : undefined;

      const where: any = { business_id: businessId };
      if (campaignId) where.id = campaignId;

      const campaigns = await prisma.campaign.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: 5,
        select: { id: true, name: true, status: true, created_at: true },
      });

      const results = await Promise.all(campaigns.map(async (c) => {
        const stats = await prisma.campaignLead.aggregate({
          where: { campaign_id: c.id, business_id: businessId },
          _count: true,
        });

        const sent = await prisma.campaignLead.aggregate({
          where: { campaign_id: c.id, business_id: businessId, status: { in: ["SENT", "RESPONDED", "INTERESTED"] as any } },
          _count: true,
        });

        const responded = await prisma.campaignLead.aggregate({
          where: { campaign_id: c.id, business_id: businessId, status: "RESPONDED" as any },
          _count: true,
        });

        const interested = await prisma.campaignLead.aggregate({
          where: { campaign_id: c.id, business_id: businessId, status: "INTERESTED" as any },
          _count: true,
        });

        const totalLeads = stats._count;
        const sentLeads = sent._count;
        const respondedLeads = responded._count;
        const interestedLeads = interested._count;

        return {
          campaign_name: c.name,
          status: c.status,
          total_leads: totalLeads,
          sent: sentLeads,
          responded: respondedLeads,
          interested: interestedLeads,
          response_rate: totalLeads > 0 ? Math.round((respondedLeads / totalLeads) * 10000) / 100 : 0,
          conversion_rate: totalLeads > 0 ? Math.round((interestedLeads / totalLeads) * 10000) / 100 : 0,
        };
      }));

      const totalLeads = results.reduce((a, r) => a + r.total_leads, 0);
      const totalInterested = results.reduce((a, r) => a + r.interested, 0);
      const avgConversion = totalLeads > 0 ? Math.round((totalInterested / totalLeads) * 10000) / 100 : 0;

      return {
        result: {
          campaigns: results,
          total_leads: totalLeads,
          total_interested: totalInterested,
          average_conversion_rate: avgConversion,
          recommendation: "Analise as campanhas com menor taxa de conversão para identificar oportunidades de melhoria na abordagem ou segmentação.",
          note: "Dados baseados no desempenho real das campanhas. Projeções de vendas futuras dependem de continuidade e volume de leads.",
        },
        stateChanged: false,
      };
    }

    default:
      return { result: { error: `Ferramenta de projeção desconhecida: ${name}` }, stateChanged: false };
  }
}