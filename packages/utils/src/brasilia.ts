/** Horários e janelas no fuso de Brasília (America/Sao_Paulo). */

export const BRASILIA_TZ = 'America/Sao_Paulo';

/** Converte um timestamp em { year, month, day, hour, minute } no fuso de Brasília. */
export function brasiliaParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRASILIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/**
 * Momentos de abertura/fechamento da janela diária de envio em Brasília.
 * `hour`/`minute` são os da hora de início configurada (ex.: 9, 0 → 09:00).
 *
 * Retorna:
 *  - open: Data (UTC) de hoje às HH:MM em Brasília; se já passou, é hoje cedo.
 *  - nextOpen: Data (UTC) da PRÓXIMA abertura (hoje se ainda não abriu, senão amanhã).
 *  - close: Data (UTC) de encerramento (a próxima abertura — janela rollover).
 */
export function brasiliaWindow(date: Date, startHour: number, startMinute = 0): { open: Date; nextOpen: Date; close: Date } {
  const p = brasiliaParts(date);
  const seconds = p.hour * 3600 + p.minute * 60;
  const startSeconds = startHour * 3600 + startMinute * 60;

  // offset fixo: America/Sao_Paulo é UTC-3 (sem DST desde 2019)
  const offsetHours = -3;

  const localToUtc = (year: number, month: number, day: number, h: number, m: number): Date =>
    new Date(Date.UTC(year, month - 1, day, h - offsetHours, m));

  if (seconds < startSeconds) {
    // Ainda não abriu hoje → aberta hoje às HH:MM
    const open = localToUtc(p.year, p.month, p.day, startHour, startMinute);
    const nextOpen = localToUtc(p.year, p.month, p.day + 1, startHour, startMinute);
    return { open, nextOpen, close: nextOpen };
  }

  // Já passou do horário → janela atual é de hoje, próxima é amanhã
  const open = localToUtc(p.year, p.month, p.day, startHour, startMinute);
  const nextOpen = localToUtc(p.year, p.month, p.day + 1, startHour, startMinute);
  return { open, nextOpen, close: nextOpen };
}

/** Data de início do dia em UTC no fuso de Brasília (00:00 local). */
export function startOfBrasiliaDay(date: Date): Date {
  const p = brasiliaParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, -3, 0, 0));
}

/** Data de início do mês em UTC no fuso de Brasília (dia 1 às 00:00 local). */
export function startOfBrasiliaMonth(date: Date): Date {
  const p = brasiliaParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, 1, -3, 0, 0));
}

/** Verifica se `date` está dentro da janela [open, close). */
export function isInsideWindow(date: Date, open: Date, close: Date): boolean {
  const t = date.getTime();
  return t >= open.getTime() && t < close.getTime();
}