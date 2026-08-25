/**
 * Extração de contato (e-mail/telefone) a partir de texto livre — usado
 * principalmente na bio/link externo de perfis do Instagram, que NÃO trazem
 * telefone/e-mail como campo estruturado.
 */

/** Rede social/linktree genérica que NÃO deve virar o `website` do lead. */
const SOCIAL_LINK_RE =
  /^(https?:\/\/)?(www\.)?(linktr\.ee|linktree|beacons\.ai|instagram\.com|facebook\.com|wa\.me|whatsapp\.com|t\.me|youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|linkedin\.com|threads\.net|bio\.link|many\.bio)\b/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Telefones BR: +55 DDD XXXXX-XXXX, (DD) XXXXX, 11 9XXXX, 55 11 9... */
const PHONE_RE =
  /(?:\+?55[\s.-]?)?(?:\(?[1-9]{2}\)?[\s.-]?)(?:9?[\s.-]?\d{4}[\s.-]?\d{4}|\d{4}[\s.-]?\d{4})/g;

/** Extrai e-mails de um texto (únicos, minúsculos). */
export function extractEmailsFromText(text: string): string[] {
  if (!text) return [];
  const found = String(text).match(EMAIL_RE) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

/**
 * Extrai telefones BR de um texto, normalizados para dígitos contínuos com
 * DDD (ex.: "(11) 91234-5678" → "5511912345678"). Retorna únicos.
 */
export function extractPhonesBR(text: string): string[] {
  if (!text) return [];
  const found = String(text).match(PHONE_RE) ?? [];
  const normalized = found.map((raw) => normalizePhone(raw)).filter(Boolean);
  return [...new Set(normalized)] as string[];
}

/** Normaliza um telefone em dígitos contínuos (mantém DDD; +55 vira 55). */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return null;
}

/** Extrai o domínio de uma URL (sem www.), ou null. */
export function extractDomain(url: string): string | null {
  if (!url) return null;
  const m = String(url).match(/^https?:\/\/([^/]+)/i);
  const host = m ? m[1] : String(url).split("/")[0];
  return host.replace(/^www\./i, "").toLowerCase() || null;
}

/** True se a URL é uma rede social/linktree genérica (não vira website). */
export function isSocialLink(url: string): boolean {
  return SOCIAL_LINK_RE.test(String(url ?? ""));
}
