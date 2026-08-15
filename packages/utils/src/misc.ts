/** Datas e miscelânea. */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Início do dia local em UTC (usado para limites diários). */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function maskSensitive(value: string, visible = 4): string {
  if (!value || value.length <= visible) return value;
  return `${value.slice(0, visible)}${'*'.repeat(Math.min(8, value.length - visible))}`;
}

/** Escape de HTML simples (para exibição segura). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
