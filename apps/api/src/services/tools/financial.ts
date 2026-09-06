import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import type { ToolDefinition, ToolResult } from "./index";

const logger = createLogger("api.tools.financial");

/**
 * Ferramentas FINANCEIRAS — SOMENTE LEITURA.
 * A aba AGENTE pode consultar resumos, listar transações, categorias e projetar,
 * mas NUNCA criar/editar/excluir lançamentos nem categorias.
 * Lançamentos são responsabilidade da aba FINANCEIRO (/financial).
 */
export const FINANCIAL_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_financial_summary",
      description: "Obtém um resumo financeiro: receitas, despesas, saldo de um período. Use para responder 'quanto gastei esse mês?', 'quanto tenho de saldo?', 'qual meu saldo atual?'.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Início do período ISO (opcional, padrão: início do mês atual)" },
          end_date: { type: "string", description: "Fim do período ISO (opcional, padrão: fim do mês atual)" },
          include_planned: { type: "boolean", description: "Incluir transações previstas/futuras", default: false },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_financial_transactions",
      description: "Lista transações financeiras de um período. Use para consultar gastos ou receitas específicas.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["INCOME", "EXPENSE", ""], description: "Filtrar por tipo (opcional)" },
          start_date: { type: "string", description: "Início do período ISO (opcional)" },
          end_date: { type: "string", description: "Fim do período ISO (opcional)" },
          category: { type: "string", description: "Nome da categoria para filtrar (opcional)" },
          status: { type: "string", enum: ["REAL", "PLANNED", "CANCELLED"], description: "Filtrar por status (opcional)" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 20, máximo 50)", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_categories",
      description: "Lista as categorias financeiras disponíveis.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["INCOME", "EXPENSE", ""], description: "Filtrar por tipo (opcional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_projection",
      description: "Projeta receitas, despesas e saldo para um período futuro considerando transações recorrentes e valores previstos. Use para responder 'quanto vou gastar mês que vem?', 'qual vai ser meu saldo?'.",
      parameters: {
        type: "object",
        properties: {
          months_ahead: { type: "integer", description: "Quantos meses à frente para projetar (padrão 1, máximo 12)", default: 1 },
        },
      },
    },
  },
];

export async function executeFinancialTool(
  name: string,
  businessId: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "get_financial_summary": {
      const now = new Date();
      const startDate = args.start_date ? new Date(String(args.start_date)) : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = args.end_date ? new Date(String(args.end_date)) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const includePlanned = args.include_planned !== false;

      const statusFilter: string[] = ["REAL"];
      if (includePlanned) statusFilter.push("PLANNED");

      const incomes = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, user_id: userId, type: "INCOME", date: { gte: startDate, lte: endDate }, status: { in: statusFilter as any } },
        _sum: { amount: true },
        _count: true,
      });

      const expenses = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, user_id: userId, type: "EXPENSE", date: { gte: startDate, lte: endDate }, status: { in: statusFilter as any } },
        _sum: { amount: true },
        _count: true,
      });

      const totalIncome = Number(incomes._sum.amount || 0);
      const totalExpense = Number(expenses._sum.amount || 0);
      const balance = totalIncome - totalExpense;

      return {
        result: {
          period: { start: startDate.toISOString(), end: endDate.toISOString() },
          incomes: { total: totalIncome, count: incomes._count },
          expenses: { total: totalExpense, count: expenses._count },
          balance,
          include_planned: includePlanned,
        },
        stateChanged: false,
      };
    }

    case "list_financial_transactions": {
      const type = args.type ? String(args.type) : undefined;
      const startDate = args.start_date ? new Date(String(args.start_date)) : undefined;
      const endDate = args.end_date ? new Date(String(args.end_date)) : undefined;
      const categoryName = args.category ? String(args.category).trim() : undefined;
      const status = args.status ? String(args.status) : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);

      const where: any = { business_id: businessId, user_id: userId };
      if (type) where.type = type;
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = startDate;
        if (endDate) where.date.lte = endDate;
      }
      if (status) where.status = status;
      if (categoryName) {
        where.category = { name: { contains: categoryName, mode: "insensitive" }, business_id: businessId };
      }

      const transactions = await prisma.financialTransaction.findMany({
        where,
        orderBy: { date: "desc" },
        take: limit,
        include: { category: { select: { id: true, name: true, color: true } } },
      });

      return {
        result: {
          count: transactions.length,
          transactions: transactions.map(t => ({
            id: t.id, type: t.type, description: t.description, amount: Number(t.amount),
            date: t.date, category: t.category?.name ?? null, status: t.status, recurrence: t.recurrence, notes: t.notes,
          })),
        },
        stateChanged: false,
      };
    }

    case "get_financial_categories": {
      const type = args.type ? String(args.type) : undefined;
      const where: any = { business_id: businessId };
      if (type) where.type = type;

      const categories = await prisma.financialCategory.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, color: true },
      });

      return { result: { count: categories.length, categories }, stateChanged: false };
    }

    case "get_financial_projection": {
      const monthsAhead = Math.min(Math.max(Number(args.months_ahead) || 1, 1), 12);
      const now = new Date();
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endOfProjection = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 0, 23, 59, 59);

      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const currentIncomes = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, user_id: userId, type: "INCOME", date: { gte: currentMonthStart, lte: currentMonthEnd }, status: { in: ["REAL", "PLANNED"] as any } },
        _sum: { amount: true },
      });

      const currentExpenses = await prisma.financialTransaction.aggregate({
        where: { business_id: businessId, user_id: userId, type: "EXPENSE", date: { gte: currentMonthStart, lte: currentMonthEnd }, status: { in: ["REAL", "PLANNED"] as any } },
        _sum: { amount: true },
      });

      const recurringTransactions = await prisma.financialTransaction.findMany({
        where: { business_id: businessId, user_id: userId, recurrence: { not: "NONE" }, status: { not: "CANCELLED" as any } },
        select: { id: true, type: true, description: true, amount: true, recurrence: true, date: true },
      });

      let projectedIncome = 0;
      let projectedExpense = 0;

      for (const rt of recurringTransactions) {
        const amount = Number(rt.amount);
        if (rt.recurrence === "MONTHLY") {
          for (let m = 0; m < monthsAhead; m++) {
            if (rt.type === "INCOME") projectedIncome += amount;
            else projectedExpense += amount;
          }
        } else if (rt.recurrence === "WEEKLY") {
          const weeksPerMonth = 4.33;
          for (let m = 0; m < monthsAhead; m++) {
            if (rt.type === "INCOME") projectedIncome += amount * weeksPerMonth;
            else projectedExpense += amount * weeksPerMonth;
          }
        } else if (rt.recurrence === "YEARLY") {
          if (monthsAhead >= 12) {
            const years = Math.floor(monthsAhead / 12);
            if (rt.type === "INCOME") projectedIncome += amount * years;
            else projectedExpense += amount * years;
          }
        }
      }

      const plannedTransactions = await prisma.financialTransaction.findMany({
        where: { business_id: businessId, user_id: userId, date: { gte: startOfNextMonth, lte: endOfProjection }, status: "PLANNED" as any },
        select: { type: true, amount: true, date: true, description: true },
      });

      for (const pt of plannedTransactions) {
        const amount = Number(pt.amount);
        if (pt.type === "INCOME") projectedIncome += amount;
        else projectedExpense += amount;
      }

      const currentBalance = Number(currentIncomes._sum.amount || 0) - Number(currentExpenses._sum.amount || 0);

      return {
        result: {
          current_month: {
            income: Number(currentIncomes._sum.amount || 0),
            expenses: Number(currentExpenses._sum.amount || 0),
            balance: currentBalance,
          },
          projection: {
            months_ahead: monthsAhead,
            projected_income: projectedIncome,
            projected_expenses: projectedExpense,
            projected_balance: currentBalance + projectedIncome - projectedExpense,
            estimated_final_balance: currentBalance + projectedIncome - projectedExpense,
          },
          note: "Projeção baseada em transações recorrentes e valores previstos. Valores podem variar.",
        },
        stateChanged: false,
      };
    }

    default:
      logger.warn("Operação não permitida no modo somente leitura", { name, business_id: businessId });
      return {
        result: { error: "Modo somente leitura: a aba Agente não pode alterar dados financeiros." },
        stateChanged: false,
      };
  }
}