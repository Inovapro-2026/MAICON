/**
 * Validação e normalização de e-mail.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normaliza: trim, lowercase. */
export function normalizeEmail(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) return null;
  const [local, domain] = trimmed.split('@');
  if (local.length > 64 || domain.length > 255) return null;
  return trimmed;
}

export function isValidEmail(input: string): boolean {
  return normalizeEmail(input) !== null;
}
