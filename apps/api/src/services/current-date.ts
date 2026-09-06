/**
 * FONTE ÚNICA DE VERDADE para data/hora do SAVYRON (JARVIS e módulos).
 *
 * O backend é a fonte oficial. Toda data/hora apresentada ao usuário usa
 * America/Sao_Paulo (fuso-padrão da plataforma) — NUNCA UTC direto.
 *
 * REGRA ABSOLUTA: data/hora vêm exclusivamente do relógio real do servidor
 * convertido para America/Sao_Paulo. NUNCA de histórico, exemplos, testes,
 * dados financeiros ou conhecimento estático do modelo.
 */

export const SAVYRON_TIMEZONE = "America/Sao_Paulo";

export interface CurrentDateTime {
  /** Data ISO completa com offset (ex.: 2026-09-05T22:08:00-03:00). */
  iso: string;
  /** Epoch em milissegundos. */
  timestamp: number;
  /** Data calendário em America/Sao_Paulo (YYYY-MM-DD). */
  date: string;
  /** Hora local (HH:MM:SS). */
  time: string;
  /** Hora local (HH:MM). */
  time24h: string;
  year: number;
  /** 1..12. */
  month: number;
  /** Nome do mês em pt-BR (ex.: "setembro"). */
  monthName: string;
  /** Dia do mês (1..31). */
  dayOfMonth: number;
  /** Dia da semana em pt-BR (ex.: "sábado"). */
  dayOfWeek: string;
  timezone: string;
}

interface WallClock {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Componentes do relógio (parede) de `date` no fuso informado. */
export function wallParts(date: Date, timeZone: string = SAVYRON_TIMEZONE): WallClock {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (em minutos) de `timeZone` em relação a UTC, em `date`. */
export function timezoneOffsetMinutes(date: Date, timeZone: string = SAVYRON_TIMEZONE): number {
  const p = wallParts(date, timeZone);
  const wallUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (wallUtc - date.getTime()) / 60_000;
}

/**
 * Data/hora atual REAL do sistema, convertida para America/Sao_Paulo.
 * `now` é opcional apenas para testes — em produção usa o relógio do servidor.
 */
export function getCurrentDateTime(now: Date = new Date()): CurrentDateTime {
  const p = wallParts(now);
  const offsetMinutes = timezoneOffsetMinutes(now);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absOffset = Math.abs(offsetMinutes);
  const offsetStr = `${sign}${String(Math.floor(absOffset / 60)).padStart(2, "0")}:${String(absOffset % 60).padStart(2, "0")}`;

  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  const timeStr = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  const dayOfWeek = new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  });
  const monthName = new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });

  return {
    iso: `${dateStr}T${timeStr}${offsetStr}`,
    timestamp: now.getTime(),
    date: dateStr,
    time: timeStr,
    time24h: `${pad(p.hour)}:${pad(p.minute)}`,
    year: p.year,
    month: p.month,
    monthName,
    dayOfMonth: p.day,
    dayOfWeek,
    timezone: SAVYRON_TIMEZONE,
  };
}

/** Ex.: "Hoje é sábado, 5 de setembro de 2026." */
export function formatDateForUser(cdt: Pick<CurrentDateTime, "dayOfWeek" | "dayOfMonth" | "monthName" | "year">): string {
  return `Hoje é ${cdt.dayOfWeek}, ${cdt.dayOfMonth} de ${cdt.monthName} de ${cdt.year}.`;
}

/** Bloco de contexto de data/hora para prompts (fonte oficial). */
export function describeCurrentDateTime(now: Date = new Date()): string {
  const c = getCurrentDateTime(now);
  return `Data atual: ${formatDateForUser(c)} Hora atual: ${c.time24h} (${c.timezone}).`;
}

/** Início do dia (wall local) de `now` como instante UTC, no fuso padrão. */
export function startOfSaoPauloDay(now: Date = new Date()): Date {
  const p = wallParts(now);
  const offsetMin = timezoneOffsetMinutes(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0) - offsetMin * 60_000);
}

/**
 * Constrói um instante UTC a partir de componentes do relógio de parede
 * (ano/mês/dia/hora/minutos em America/Sao_Paulo).
 */
export function wallToInstant(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number },
  now: Date = new Date(),
): Date {
  const offsetMin = timezoneOffsetMinutes(now);
  const h = parts.hour ?? 0;
  const m = parts.minute ?? 0;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, h, m, 0) - offsetMin * 60_000);
}

export interface ParsedNaturalDate {
  expression: string;
  /** Instante UTC ISO. */
  iso: string;
  /** Data calendário em America/Sao_Paulo (YYYY-MM-DD). */
  date: string;
  dayOfWeek: string;
  interpretation: string;
}

const WEEKDAY_NAMES: Record<string, number> = {
  domingo: 0,
  segunda: 1, segunda_feira: 1,
  terça: 2, terça_feira: 2, terca: 2, terca_feira: 2,
  quarta: 3, quarta_feira: 3,
  quinta: 4, quinta_feira: 4,
  sexta: 5, sexta_feira: 5,
  sábado: 6, sabado: 6,
};
const WEEKDAY_KEYS = Object.keys(WEEKDAY_NAMES);

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month 1..12
}

function weekdayName(wall: { year: number; month: number; day: number }): string {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).toLocaleDateString("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  });
}

function describe(wall: { year: number; month: number; day: number }): string {
  const monthName = MONTH_NAMES[wall.month - 1];
  return `${wall.day} de ${monthName} de ${wall.year}`;
}

/**
 * Interpreta uma expressão de data natural usando a data/hora REAL atual
 * (relógio do servidor em America/Sao_Paulo). NUNCA usa o contexto anterior.
 *
 * Ex.: "hoje", "amanhã", "ontem", "depois de amanhã", "dia 15",
 * "15 de dezembro", "15 de dezembro de 2026", "dia 15 do mês que vem",
 * "daqui a 5 dias", "daqui a 2 semanas", "semana que vem", "mês que vem",
 * "final do mês", "ano que vem", "próxima segunda-feira".
 */
export function parseNaturalDate(expression: string, now: Date = new Date()): ParsedNaturalDate | null {
  const lower = expression.toLowerCase().trim();
  if (!lower) return null;

  const p = wallParts(now);
  const today: { year: number; month: number; day: number } = { year: p.year, month: p.month, day: p.day };
  const base = startOfSaoPauloDay(now);

  const result = { expression };

  const push = (wall: { year: number; month: number; day: number }): ParsedNaturalDate => {
    const instant = wallToInstant(wall, now);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      ...result,
      iso: instant.toISOString(),
      date: `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`,
      dayOfWeek: weekdayName(wall),
      interpretation: `${weekdayName(wall)}, ${describe(wall)}`,
    };
  };

  const addDays = (n: number): Date => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };

  // hoje / amanhã / ontem / depois de amanhã
  if (lower === "hoje" || lower === "hoy") return push(today);
  if (lower === "amanhã" || lower === "amanha") {
    const w = wallParts(addDays(1));
    return push(w);
  }
  if (lower === "ontem") {
    const w = wallParts(addDays(-1));
    return push(w);
  }
  if (lower === "depois de amanhã" || lower === "depois de amanha" || lower === "depoisdeamanhã" || lower === "depoisdeamanha") {
    const w = wallParts(addDays(2));
    return push(w);
  }

  // semana que vem
  if (lower === "semana que vem") return push(wallParts(addDays(7)));

  // dia da semana: "próxima segunda-feira" / "segunda-feira" / "sábado"
  const weekdayInput = lower.replace(/-feira\b/g, "_feira").trim();
  const weekdayRe = new RegExp(`^(?:pr[oó]xim[oa]s?\\s+)?(${WEEKDAY_KEYS.join("|")})$`);
  const wdMatch = weekdayInput.match(weekdayRe);
  if (wdMatch) {
    const target = WEEKDAY_NAMES[wdMatch[1]];
    const currentDay = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    let delta = target - currentDay;
    if (delta <= 0) delta += 7;
    return push(wallParts(addDays(delta)));
  }

  // dia N (do mês atual ou próximo)
  const dayOnly = lower.match(/^dia\s+(\d{1,2})$/);
  if (dayOnly) {
    const day = parseInt(dayOnly[1], 10);
    let wall = { year: p.year, month: p.month, day };
    // se já passou (ou é hoje), vai para o próximo mês
    if (wall.day <= today.day) {
      wall = { year: p.year, month: p.month + 1, day: Math.min(day, daysInMonth(p.year, p.month + 1)) };
    }
    return push(wall);
  }

  // dia N do mês que vem
  const nextMonthDay = lower.match(/^dia\s+(\d{1,2})\s+do\s+m[eê]s\s+que\s+vem$/);
  if (nextMonthDay) {
    const wall = { year: p.year, month: p.month + 1, day: Math.min(parseInt(nextMonthDay[1], 10), daysInMonth(p.year, p.month + 1)) };
    return push(wall);
  }

  // N de mês [de ano]
  const dayMonth = lower.match(/^(\d{1,2})\s+de\s+([a-zçãéê]+)(?:\s+de\s+(\d{4}))?$/);
  if (dayMonth) {
    const day = parseInt(dayMonth[1], 10);
    const token = dayMonth[2] === "marco" ? "março" : dayMonth[2];
    const monthIdx = token.length >= 3 ? MONTH_NAMES.findIndex((m) => m.startsWith(token)) : -1;
    const month = monthIdx === -1 ? -1 : monthIdx + 1;
    if (month >= 1 && month <= 12) {
      let year = dayMonth[3] ? parseInt(dayMonth[3], 10) : p.year;
      if (!dayMonth[3]) {
        // sem ano e já passou neste ano → próximo ano
        const candidate = { year, month, day: Math.min(day, daysInMonth(year, month)) };
        if (candidate.year < p.year ||
          (candidate.year === p.year && (candidate.month < p.month || (candidate.month === p.month && candidate.day < today.day)))) {
          year += 1;
        }
      }
      return push({ year, month, day: Math.min(day, daysInMonth(year, month)) });
    }
  }

  // daqui a N dias / semanas / meses / anos
  const daysAhead = lower.match(/^daqui\s+a\s+(\d+)\s+dia(?:s)?$/);
  if (daysAhead) return push(wallParts(addDays(parseInt(daysAhead[1], 10))));
  const weeksAhead = lower.match(/^daqui\s+a\s+(\d+)\s+semana(?:s)?$/);
  if (weeksAhead) return push(wallParts(addDays(parseInt(weeksAhead[1], 10) * 7)));
  const monthsAhead = lower.match(/^daqui\s+a\s+(\d+)\s+m[eê]ses?$/);
  if (monthsAhead) {
    const n = parseInt(monthsAhead[1], 10);
    const wall = { year: p.year, month: p.month + n, day: Math.min(today.day, daysInMonth(p.year, p.month + n)) };
    return push(wall);
  }
  const yearsAhead = lower.match(/^daqui\s+a\s+(\d+)\s+ano(?:s)?$/);
  if (yearsAhead) {
    const wall = { year: p.year + parseInt(yearsAhead[1], 10), month: p.month, day: Math.min(today.day, daysInMonth(p.year + parseInt(yearsAhead[1], 10), p.month)) };
    return push(wall);
  }

  // mês que vem / próximo mês / no próximo mês
  if (lower === "mês que vem" || lower === "mes que vem" || lower === "próximo mês" || lower === "proximo mes" || lower === "no próximo mês" || lower === "no proximo mes") {
    return push({ year: p.year, month: p.month + 1, day: 1 });
  }

  // final do mês
  if (lower === "final do mês" || lower === "final do mes" || lower === "no final do mês" || lower === "no final do mes") {
    return push({ year: p.year, month: p.month, day: daysInMonth(p.year, p.month) });
  }

  // início do mês
  if (lower === "início do mês" || lower === "inicio do mes" || lower === "no início do mês" || lower === "no inicio do mes") {
    return push({ year: p.year, month: p.month, day: 1 });
  }

  // ano que vem
  if (lower === "ano que vem" || lower === "próximo ano" || lower === "proximo ano") {
    return push({ year: p.year + 1, month: 1, day: 1 });
  }

  return null;
}