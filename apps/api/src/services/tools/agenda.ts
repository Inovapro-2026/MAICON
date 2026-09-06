import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import type { ToolDefinition, ToolResult } from "./index";
import { parseNaturalDate, wallParts, wallToInstant } from "../current-date";

const logger = createLogger("api.tools.agenda");

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Data calendário (America/Sao_Paulo) de um instante. */
function wallDateString(date: Date): string {
  const p = wallParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Rótulo dt/br (wall) de um instante, sem deslocamento por fuso do servidor. */
function wallDateLabel(date: Date): string {
  const p = wallParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Aplica hora/minuto (wall clock, America/Sao_Paulo) a uma data. */
function attachTime(date: Date, time: { hour: number; minute: number }): Date {
  const p = wallParts(date);
  return wallToInstant(
    { year: p.year, month: p.month, day: p.day, hour: time.hour, minute: time.minute },
    date,
  );
}

/**
 * Interpreta data em linguagem natural usando a fonte oficial de data/hora
 * (relógio do servidor em America/Sao_Paulo) — NUNCA o relógio local/UTC
 * indefinido, garantindo consistência com o restante da plataforma.
 */
function parseRelativeDate(text: string): Date | null {
  const parsed = parseNaturalDate(text);
  return parsed ? new Date(parsed.iso) : null;
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const lower = text.toLowerCase().trim();

  const hmmMatch = lower.match(/^(\d{1,2}):(\d{2})$/);
  if (hmmMatch) {
    const h = parseInt(hmmMatch[1], 10);
    const m = parseInt(hmmMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m };
  }

  const hourMatch = lower.match(/^(\d{1,2})\s*horas?$/);
  if (hourMatch) {
    const h = parseInt(hourMatch[1], 10);
    if (h >= 0 && h <= 23) return { hour: h, minute: 0 };
  }

  const hourMinMatch = lower.match(/^(\d{1,2})\s*[e:]\s*(\d{1,2})\s*(minutos?)?$/);
  if (hourMinMatch) {
    const h = parseInt(hourMinMatch[1], 10);
    const m = parseInt(hourMinMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m };
  }

  const ampmMatch = lower.match(/^(\d{1,2})\s*(da\s+)?(manhã|tarde|noite)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const period = ampmMatch[3];
    if (period === "tarde" && h < 12) h += 12;
    if (period === "noite" && h < 12) h += 12;
    if (period === "manhã" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: 0 };
  }

  if (lower === "meio-dia" || lower === "meio dia" || lower === "meiodia") return { hour: 12, minute: 0 };
  if (lower === "meia-noite" || lower === "meia noite" || lower === "meianoite") return { hour: 0, minute: 0 };

  return null;
}

function parseDateFromText(text: string): { date: Date; time?: { hour: number; minute: number }; endTime?: { hour: number; minute: number } } | null {
  const lower = text.toLowerCase().trim();

  const dashRange = lower.match(/^(.+?)\s+(da|das|de)\s+(\d{1,2}(?::\d{2})?\s*(?:horas?)?(?:\s*da\s+(?:manhã|tarde|noite))?)\s+(?:a|às|até|ate)\s+(\d{1,2}(?::\d{2})?\s*(?:horas?)?(?:\s*da\s+(?:manhã|tarde|noite))?)$/i);
  if (dashRange) {
    const datePart = dashRange[1].trim();
    const startTimeText = dashRange[3].trim();
    const endTimeText = dashRange[4].trim();
    const date = parseRelativeDate(datePart) || parseDateFromText(datePart)?.date || null;
    const startTime = parseTime(startTimeText);
    const endTime = parseTime(endTimeText);
    if (date && startTime) {
      return { date: attachTime(date, startTime), time: startTime, endTime: endTime || undefined };
    }
  }

  const timeFirst = lower.match(/^(à|a)s?\s*(\d{1,2}(?::\d{2})?\s*(?:horas?)?(?:\s*da\s+(?:manhã|tarde|noite))?)\s+(.+)$/i);
  if (timeFirst) {
    const timeText = timeFirst[2].trim();
    const remainingText = timeFirst[3].trim();
    const time = parseTime(timeText);
    const date = parseRelativeDate(remainingText) || parseDateFromText(remainingText)?.date || null;
    if (time && date) {
      return { date: attachTime(date, time), time };
    }
  }

  const dateFirst = lower.match(/^(.+?)\s+(à|a)s?\s*(\d{1,2}(?::\d{2})?\s*(?:horas?)?(?:\s*da\s+(?:manhã|tarde|noite))?)$/i);
  if (dateFirst) {
    const dateText = dateFirst[1].trim();
    const timeText = dateFirst[3].trim();
    const date = parseRelativeDate(dateText) || parseDateFromText(dateText)?.date || null;
    const time = parseTime(timeText);
    if (date && time) {
      return { date: attachTime(date, time), time };
    }
    if (date) return { date };
  }

  const dateOnly = parseRelativeDate(lower);
  if (dateOnly) return { date: dateOnly };

  return null;
}

export const AGENDA_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "parse_date",
      description: "Interpreta uma data ou horário em linguagem natural e retorna uma data ISO. Use para converter 'amanhã', 'dia 15', 'sexta-feira', 'daqui a 10 dias', 'dia 15 do mês que vem', '15 de dezembro', '8 da manhã', 'meio-dia', etc. em datas ISO reais.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto em linguagem natural contendo data e/ou horário (ex.: 'amanhã às 10', 'dia 15', 'sexta às 14', 'daqui a 3 dias', '15 de dezembro', 'todo dia 10')" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_event_conflicts",
      description: "Verifica se há conflitos de horário para um possível novo evento em uma data/hora específica. Use para saber se o senhor tem horário livre.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Data/hora de início ISO (ex.: 2026-09-06T10:00:00.000Z)" },
          end_date: { type: "string", description: "Data/hora de fim ISO (opcional, padrão: 1 hora após início)" },
          exclude_event_id: { type: "string", description: "ID do evento a excluir da verificação" },
        },
        required: ["start_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_free_slots",
      description: "Encontra horários livres em um dia específico. Use para responder 'tenho horário livre amanhã?', 'qual horário está livre?'.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data ISO para verificar (ex.: 2026-09-06T00:00:00.000Z)" },
          start_hour: { type: "integer", description: "Hora inicial para busca (padrão: 8)", default: 8 },
          end_hour: { type: "integer", description: "Hora final para busca (padrão: 18)", default: 18 },
          duration_minutes: { type: "integer", description: "Duração desejada em minutos (padrão: 60)", default: 60 },
        },
        required: ["date"],
      },
    },
  },
];

export async function executeAgendaTool(
  name: string,
  businessId: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "parse_date": {
      const text = String(args.text ?? "").trim();
      if (!text) return { result: { error: "Texto é obrigatório" }, stateChanged: false };

      const now = new Date();
      const lower = text.toLowerCase();

      const isRecurrence = lower.startsWith("todo") || lower.startsWith("toda") || lower.startsWith("todos") || lower.startsWith("todas");
      if (isRecurrence) {
        let recurrenceType = "NONE";
        let dayOfMonth: number | null = null;
        let weekday: string | null = null;

        const dailyMatch = lower.match(/todo\s+dia|todos\s+os\s+dias/);
        if (dailyMatch) recurrenceType = "DAILY";

        const weeklyMatch = lower.match(/toda\s+(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i);
        if (weeklyMatch) {
          recurrenceType = "WEEKLY";
          weekday = weeklyMatch[1].toLowerCase();
        }

        const monthlyMatch = lower.match(/todo\s+dia\s+(\d{1,2})/);
        if (monthlyMatch) {
          recurrenceType = "MONTHLY";
          dayOfMonth = parseInt(monthlyMatch[1], 10);
        }

        const dayMatch = lower.match(/todo\s+mês|todo\s+mês\s+no\s+dia\s+(\d{1,2})/);
        if (dayMatch) {
          recurrenceType = "MONTHLY";
          if (dayMatch[1]) dayOfMonth = parseInt(dayMatch[1], 10);
        }

        const yearMatch = lower.match(/todo\s+ano/);
        if (yearMatch) recurrenceType = "YEARLY";

        const timeText = lower.replace(/todo\s+dia\s*(\d{1,2})?\s*|todos\s+os\s+dias\s*|toda\s+\w+\s*|todo\s+mês\s*(?:no\s+dia\s+\d{1,2})?\s*|todo\s+ano\s*/gi, "").trim();
        const time = parseTime(timeText);

        return {
          result: {
            is_recurrence: true,
            recurrence_type: recurrenceType,
            day_of_month: dayOfMonth,
            weekday: weekday,
            time: time ? `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}` : "08:00",
            interpretation: `Recorrência ${recurrenceType === "DAILY" ? "diária" : recurrenceType === "WEEKLY" ? `semanal às ${weekday}` : recurrenceType === "MONTHLY" ? `mensal no dia ${dayOfMonth}` : "anual"}${time ? ` às ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}` : ""}`,
          },
          stateChanged: false,
        };
      }

      const parsed = parseDateFromText(text);
      if (!parsed) {
        const fallbackDate = new Date(text);
        if (!isNaN(fallbackDate.getTime())) {
          return { result: { iso: fallbackDate.toISOString(), date: wallDateString(fallbackDate), time: fallbackDate.toISOString().split("T")[1]?.slice(0, 5) || null }, stateChanged: false };
        }
        return { result: { error: "Não foi possível interpretar a data. Seja mais específico (ex.: 'amanhã', 'dia 15', 'sexta-feira')." }, stateChanged: false };
      }

      return {
        result: {
          iso: parsed.date.toISOString(),
          date: wallDateString(parsed.date),
          time: parsed.time ? `${pad2(parsed.time.hour)}:${pad2(parsed.time.minute)}` : null,
          end_time: parsed.endTime ? `${pad2(parsed.endTime.hour)}:${pad2(parsed.endTime.minute)}` : null,
          interpretation: `${wallDateLabel(parsed.date)}${parsed.time ? ` às ${pad2(parsed.time.hour)}:${pad2(parsed.time.minute)}` : ""}`,
        },
        stateChanged: false,
      };
    }

    case "check_event_conflicts": {
      const startDate = new Date(String(args.start_date ?? ""));
      if (isNaN(startDate.getTime())) return { result: { error: "Data de início inválida" }, stateChanged: false };

      const defaultEnd = new Date(startDate.getTime() + 60 * 60 * 1000);
      const endDate = args.end_date ? new Date(String(args.end_date)) : defaultEnd;
      const excludeId = args.exclude_event_id ? String(args.exclude_event_id) : undefined;

      const where: any = {
        business_id: businessId,
        user_id: userId,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        start_date: { lt: endDate },
      };
      if (excludeId) where.id = { not: excludeId };

      const conflicts = await prisma.calendarEvent.findMany({
        where: { ...where, end_date: { gte: startDate } },
        select: { id: true, title: true, start_date: true, end_date: true },
      });

      if (conflicts.length === 0) {
        const alsoCheck = await prisma.calendarEvent.findMany({
          where: { ...where, end_date: null, start_date: { gte: startDate, lt: endDate } },
          select: { id: true, title: true, start_date: true, end_date: true },
        });
        if (alsoCheck.length > 0) conflicts.push(...alsoCheck);
      }

      return {
        result: {
          has_conflicts: conflicts.length > 0,
          conflicts: conflicts.map(c => ({
            id: c.id,
            title: c.title,
            start: c.start_date.toISOString(),
            end: c.end_date?.toISOString() ?? null,
          })),
          count: conflicts.length,
        },
        stateChanged: false,
      };
    }

    case "find_free_slots": {
      const date = new Date(String(args.date ?? ""));
      if (isNaN(date.getTime())) return { result: { error: "Data inválida" }, stateChanged: false };

      const startHour = Math.min(Math.max(Number(args.start_hour) || 8, 0), 23);
      const endHour = Math.min(Math.max(Number(args.end_hour) || 18, 1), 24);
      const durationMinutes = Math.max(Number(args.duration_minutes) || 60, 15);

      // Limites do dia com base no relógio de parede (America/Sao_Paulo) —
      // consistentes com parse_date e com a fonte oficial de data/hora.
      const wall = wallParts(date);
      const dayStart = wallToInstant(
        { year: wall.year, month: wall.month, day: wall.day, hour: startHour, minute: 0 },
        date,
      );
      const dayEnd = wallToInstant(
        { year: wall.year, month: wall.month, day: wall.day, hour: Math.min(endHour, 24), minute: 0 },
        date,
      );

      const events = await prisma.calendarEvent.findMany({
        where: {
          business_id: businessId,
          user_id: userId,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          start_date: { lt: dayEnd },
          end_date: { gte: dayStart },
        },
        orderBy: { start_date: "asc" },
        select: { title: true, start_date: true, end_date: true },
      });

      const busySlots: Array<{ start: Date; end: Date }> = [];
      for (const e of events) {
        const eStart = e.start_date < dayStart ? dayStart : e.start_date;
        const eEnd = e.end_date && e.end_date > eStart ? e.end_date : new Date(e.start_date.getTime() + 60 * 60 * 1000);
        busySlots.push({ start: eStart > dayStart ? eStart : dayStart, end: eEnd < dayEnd ? eEnd : dayEnd });
      }

      const freeSlots: Array<{ start: string; end: string }> = [];
      let cursor = new Date(dayStart);
      for (const slot of busySlots) {
        if (slot.start > cursor) {
          const diff = (slot.start.getTime() - cursor.getTime()) / (60 * 1000);
          if (diff >= durationMinutes) {
            freeSlots.push({ start: cursor.toISOString(), end: slot.start.toISOString() });
          }
        }
        if (slot.end > cursor) cursor = new Date(slot.end);
      }
      if (cursor < dayEnd) {
        const diff = (dayEnd.getTime() - cursor.getTime()) / (60 * 1000);
        if (diff >= durationMinutes) {
          freeSlots.push({ start: cursor.toISOString(), end: dayEnd.toISOString() });
        }
      }

      return {
        result: {
          date: wallDateString(date),
          free_slots: freeSlots,
          count: freeSlots.length,
          has_free_slots: freeSlots.length > 0,
          interpretation: freeSlots.length > 0
            ? `Horários livres: ${freeSlots.map(s => `${new Date(s.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - ${new Date(s.end).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`).join(", ")}`
            : "Nenhum horário livre disponível neste período",
        },
        stateChanged: false,
      };
    }

    default:
      logger.warn("Operação não permitida no modo somente leitura", { name, business_id: businessId });
      return {
        result: { error: "Modo somente leitura: a aba Agente não pode alterar a agenda." },
        stateChanged: false,
      };
  }
}