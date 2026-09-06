import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import type { ToolDefinition, ToolResult } from "./index";

const logger = createLogger("api.tools.calendar");

/**
 * Ferramentas de AGENDA — SOMENTE LEITURA.
 * A aba AGENTE pode consultar eventos e lembretes, mas NUNCA criar/alterar/excluir.
 * Criação/edição de agenda é responsabilidade da aba AGENDA (/calendar).
 */
export const CALENDAR_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_calendar_events",
      description: "Lista eventos da agenda em um período. Use para consultar compromissos, verificar disponibilidade, saber o que está agendado.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Início do período ISO (opcional, padrão: hoje)" },
          end_date: { type: "string", description: "Fim do período ISO (opcional, padrão: hoje + 7 dias)" },
          status: { type: "string", enum: ["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED"], description: "Filtrar por status (opcional)" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 20, máximo 50)", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "Lista lembretes pendentes ou futuros. Use para verificar lembretes agendados.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PENDING", "COMPLETED", "CANCELLED"], description: "Filtrar por status (opcional, padrão: PENDING)" },
          limit: { type: "integer", description: "Máximo de resultados (padrão 10, máximo 50)", default: 10 },
        },
      },
    },
  },
];

export async function executeCalendarTool(
  name: string,
  businessId: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "list_calendar_events": {
      const startDate = args.start_date ? new Date(String(args.start_date)) : new Date();
      const endDate = args.end_date
        ? new Date(String(args.end_date))
        : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      const status = args.status ? String(args.status) : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);

      const where: any = {
        business_id: businessId,
        user_id: userId,
        start_date: { gte: startDate, lte: endDate },
      };
      if (status) where.status = status;

      const events = await prisma.calendarEvent.findMany({
        where,
        orderBy: { start_date: "asc" },
        take: limit,
        select: { id: true, title: true, description: true, start_date: true, end_date: true, all_day: true, category: true, priority: true, status: true, recurrence: true },
      });

      return { result: { count: events.length, events }, stateChanged: false };
    }

    case "list_reminders": {
      const status = String(args.status ?? "PENDING");
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);

      const where: any = { business_id: businessId, user_id: userId };
      if (status === "PENDING") {
        where.status = "PENDING";
        where.remind_at = { gte: new Date() };
      } else {
        where.status = status;
      }

      const reminders = await prisma.reminder.findMany({
        where,
        orderBy: { remind_at: "asc" },
        take: limit,
        select: { id: true, title: true, description: true, remind_at: true, recurring: true, recurrence: true, status: true },
      });

      return { result: { count: reminders.length, reminders }, stateChanged: false };
    }

    default:
      logger.warn("Operação não permitida no modo somente leitura", { name, business_id: businessId });
      return {
        result: { error: "Modo somente leitura: a aba Agente não pode alterar a agenda." },
        stateChanged: false,
      };
  }
}