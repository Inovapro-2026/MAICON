/**
 * Utilidades de telefone brasileiro.
 * Normaliza para E.164 (formato internacional) e valida.
 * Regras: +55 + DDD (2 dígitos) + número (8 ou 9 dígitos).
 * Considera a 9ª casa do celular como opcional na entrada, mas adiciona quando ausente.
 */

const DIGITS_ONLY = /\D/g;

export interface PhoneParts {
  countryCode: string;
  areaCode: string;
  number: string;
  full: string;
}

/** Remove qualquer caractere que não seja dígito ou "+". */
export function digitsOnly(value: string): string {
  return String(value ?? '').replace(DIGITS_ONLY, '');
}

/**
 * Normaliza um telefone para o formato internacional E.164.
 * Exemplos:
 *   "11 98765-4321"  -> "+5511987654321"
 *   "+55 11 987654321" -> "+5511987654321"
 *   "987654321" (sem DDD) -> "+5511987654321" se assumirmos DDD 11? -> invalid
 */
export function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  let digits = digitsOnly(input);

  if (digits.length < 10 || digits.length > 13) return null;

  // Remove o prefixo nacional do Brasil caso presente (+55)
  let countryCode = '55';
  if (digits.startsWith('55') && digits.length > 11) {
    // ex: 5511987654321 (13 dígitos) ou 551187654321 (12)
    digits = digits.slice(2);
  } else if (digits.startsWith('55') && digits.length === 11 && !input.includes('55')) {
    // pode ser DDD 55 (interior) com número local — mantém
  }

  // Sem código de país (apenas DDD + número)
  if (digits.length === 10 || digits.length === 11) {
    const areaCode = digits.slice(0, 2);
    let number = digits.slice(2);
    // Celular brasileiro precisa ter 9 dígitos com 9 na frente
    if (number.length === 8 && !['6', '7', '8', '9'].includes(number[0])) {
      return null; // telefone fixo sem 9º dígito — ainda aceitamos? regra do negócio: só celular
    }
    if (number.length === 8) {
      number = `9${number}`;
    }
    if (number.length !== 9) return null;
    if (number.length === 9 && number[0] !== '9' && number[0] !== '8' && number[0] !== '7' && number[0] !== '6') {
      return null;
    }
    return `+${countryCode}${areaCode}${number}`;
  }

  // Com código de país
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith('55')) {
      const rest = digits.slice(2);
      if (rest.length === 10 || rest.length === 11) {
        const areaCode = rest.slice(0, 2);
        let number = rest.slice(2);
        if (number.length === 8) number = `9${number}`;
        if (number.length !== 9) return null;
        return `+55${areaCode}${number}`;
      }
    }
    return null;
  }

  return null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

export function parsePhone(input: string): PhoneParts | null {
  const full = normalizePhone(input);
  if (!full) return null;
  const digits = digitsOnly(full);
  return {
    countryCode: digits.slice(0, 2),
    areaCode: digits.slice(2, 4),
    number: digits.slice(4),
    full,
  };
}

/** Formata um E.164 para exibição "(11) 98765-4321". */
export function formatPhone(input: string): string {
  const digits = digitsOnly(input);
  if (digits.length === 13 && digits.startsWith('55')) {
    const area = digits.slice(2, 4);
    const number = digits.slice(4);
    if (number.length === 9) {
      return `(${area}) ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    return `(${area}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }
  return input;
}

/** WhatsApp JID a partir de um E.164 (+5511987654321 -> 5511987654321@s.whatsapp.net). */
export function toWhatsAppJid(input: string): string | null {
  const normalized = normalizePhone(input);
  if (!normalized) return null;
  return `${digitsOnly(normalized)}@s.whatsapp.net`;
}
