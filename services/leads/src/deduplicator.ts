/**
 * Deduplicador de leads.
 * Prioridade de deduplicação: telefone > e-mail > identificador externo > nome+telefone.
 * Deduplica tanto dentro do arquivo (primeira ocorrência vence) quanto contra a base existente.
 */
import { ImportRowStatus, ProcessedLead, RawLeadRecord } from '@prospector/types';
import { ColumnMapping, normalizeRecord } from './normalizer';
import { validateRecord } from './validator';

export interface ExistingLeadKey {
  phone?: string | null;
  email?: string | null;
  externalId?: string | null;
  namePhone?: string | null;
}

export interface DedupeResult {
  processed: ProcessedLead[];
}

/**
 * Monta a lista de ProcessedLead aplicando validação e deduplicação.
 * `existing` contém fingerprints já presentes na base (telefone/e-mail/external id normalizados).
 */
export function processRecords(
  rows: RawLeadRecord[],
  mapping: ColumnMapping,
  existing: ExistingLeadKey[] = []
): DedupeResult {
  const seen = new Map<string, { reason: string; rowIndex: number }>();
  const existingByType: Record<'phone' | 'email' | 'extid' | 'name_phone', Set<string>> = {
    phone: new Set(existing.map((e) => e.phone).filter(Boolean) as string[]),
    email: new Set(existing.map((e) => e.email).filter(Boolean) as string[]),
    extid: new Set(existing.map((e) => e.externalId).filter(Boolean) as string[]),
    name_phone: new Set(existing.map((e) => e.namePhone).filter(Boolean) as string[]),
  };

  const processed: ProcessedLead[] = [];

  // Ordem de prioridade para deduplicação
  const priority: Array<keyof typeof existingByType> = ['phone', 'email', 'extid', 'name_phone'];
  const reasonLabels: Record<string, string> = {
    phone: 'telefone já cadastrado',
    email: 'e-mail já cadastrado',
    extid: 'identificador externo já cadastrado',
    name_phone: 'nome+telefone já cadastrado',
  };

  for (const row of rows) {
    const { errors, valid } = validateRecord(row, mapping);
    const normalized = normalizeRecord(row, mapping);
    const fingerprints = normalized.fingerprints;

    const duplicateReasons: string[] = [];
    let duplicate = false;

    if (valid) {
      for (const key of priority) {
        const fp = fingerprints[key];
        if (!fp) continue;

        const inFile = seen.get(fp);
        if (inFile) {
          duplicate = true;
          duplicateReasons.push(`${reasonLabels[key]} (linha ${inFile.rowIndex})`);
          break;
        }
        if (existingByType[key].has(fp)) {
          duplicate = true;
          duplicateReasons.push(reasonLabels[key]);
          break;
        }
      }
    }

    if (!duplicate && valid) {
      for (const [key, fp] of Object.entries(fingerprints)) {
        if (fp && !seen.has(fp)) {
          seen.set(fp, { reason: key, rowIndex: row.rowIndex });
        }
      }
    }

    let status: ImportRowStatus;
    if (!valid) status = 'INVALID';
    else if (duplicate) status = 'DUPLICATE';
    else status = 'NEW';

    processed.push({
      rowIndex: row.rowIndex,
      raw: row,
      name: normalized.name,
      phone: normalized.phone,
      email: normalized.email,
      businessName: normalized.businessName,
      city: normalized.city,
      state: normalized.state,
      externalId: normalized.externalId,
      errors,
      duplicateReasons,
      status,
      fingerprints,
    });
  }

  return { processed };
}

export function summarizeProcessed(processed: ProcessedLead[]) {
  const summary = {
    total: processed.length,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    newLeads: 0,
    errorsByRow: {} as Record<number, string[]>,
  };

  for (const p of processed) {
    if (p.status === 'INVALID') {
      summary.invalid += 1;
      summary.errorsByRow[p.rowIndex] = p.errors;
    } else if (p.status === 'DUPLICATE') {
      summary.duplicates += 1;
    } else if (p.status === 'NEW') {
      summary.valid += 1;
      summary.newLeads += 1;
    }
  }

  return summary;
}
