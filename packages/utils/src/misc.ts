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

/** Nomes placeholder gravados em leads auto-criados (sem nome real coletado). */
export const PLACEHOLDER_LEAD_NAMES = ['novo contato', 'contato', 'cliente', 'lead'];

/** Regex de nome placeholder — derivado de PLACEHOLDER_LEAD_NAMES (fonte única). */
export const PLACEHOLDER_LEAD_NAME_PATTERN = new RegExp(`^(${PLACEHOLDER_LEAD_NAMES.join('|')})$`, 'i');

/** Indica se o lead já tem nome real coletado (não nulo/vazio/placeholder). */
export function hasRealLeadName(name: string | null | undefined): boolean {
  return Boolean(name?.trim()) && !PLACEHOLDER_LEAD_NAME_PATTERN.test(String(name).trim());
}

/** Variáveis de personalização suportadas nas mensagens de campanha. */
export const MESSAGE_TEMPLATE_VARS = ['nome', 'empresa', 'email', 'telefone'] as const;

/**
 * Renderiza variáveis {{nome}}, {{empresa}}, {{email}}, {{telefone}} em um
 * template de mensagem usando os dados do lead. Desconhecidas são removidas.
 */
export function renderMessageTemplate(
  template: string,
  lead: { name?: string | null; business_name?: string | null; email?: string | null; phone?: string | null }
): string {
  return template
    .replaceAll('{{nome}}', lead.name?.trim() || '')
    .replaceAll('{{empresa}}', lead.business_name?.trim() || '')
    .replaceAll('{{email}}', lead.email?.trim() || '')
    .replaceAll('{{telefone}}', lead.phone?.trim() || '')
    .replaceAll(/\{\{\s*(nome|empresa|email|telefone)\s*\}\}/g, '');
}

/** Mensagem exigida quando o canal usa e-mail sem assunto/corpo configurados. */
export const EMAIL_CONFIG_REQUIRED_MSG =
  'Configure o assunto e a mensagem do e-mail antes de iniciar a campanha.';

/**
 * Valida se a campanha pode disparar e-mail: modos EMAIL/BOTH exigem assunto
 * e corpo preenchidos. Retorna mensagem de erro ou null quando ok.
 */
export function validateCampaignEmailConfig(
  channelMode: string,
  emailSubject?: string | null,
  emailBody?: string | null
): string | null {
  if (channelMode !== 'EMAIL' && channelMode !== 'BOTH') return null;
  if (!emailSubject?.trim() || !emailBody?.trim()) return EMAIL_CONFIG_REQUIRED_MSG;
  return null;
}
