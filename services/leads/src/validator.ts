/**
 * Validação de leads: um lead é válido se tiver telefone válido OU e-mail válido.
 * E-mail sem telefone (ou vice-versa) é aceitável.
 */
import { RawLeadRecord } from '@prospector/types';
import { isValidEmail, isValidPhone } from '@prospector/utils';
import { ColumnMapping, normalizeRecord } from './normalizer';

export interface ValidationResult {
  errors: string[];
  /** true quando o lead é aproveitável */
  valid: boolean;
}

export function validateRecord(row: RawLeadRecord, mapping: ColumnMapping): ValidationResult {
  const errors: string[] = [];
  const normalized = normalizeRecord(row, mapping);

  const hasPhone = normalized.phone !== null;
  const hasEmail = normalized.email !== null;

  if (!hasPhone && !hasEmail) {
    errors.push('Sem telefone válido nem e-mail válido');
    return { errors, valid: false };
  }

  if (hasPhone && !isValidPhone(normalized.phone as string)) {
    errors.push('Telefone inválido');
  }
  if (hasEmail && !isValidEmail(normalized.email as string)) {
    errors.push('E-mail inválido');
  }

  return { errors, valid: errors.length === 0 };
}
