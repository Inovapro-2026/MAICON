/**
 * Importador de leads: recebe conteúdo (CSV colado, arquivo .csv ou .xlsx),
 * identifica colunas, valida, normaliza e deduplica.
 * A prévia é calculada de forma síncrona; a gravação em banco acontece no worker.
 */
import { ImportSummary, ProcessedLead, RawLeadRecord } from '@prospector/types';
import { parseCsv } from '@prospector/utils';
import { createLogger } from '@prospector/logger';
import { identifyColumns, ColumnMapping, normalizeRecord } from './normalizer';
import { processRecords, ExistingLeadKey } from './deduplicator';

const logger = createLogger('leads.importer');

export interface ParseImportOptions {
  delimiter?: string;
  /** Fingerprints já existentes no banco (para deduplicação). */
  existing?: ExistingLeadKey[];
  /** Máximo de registros processados (modo teste). */
  maxRows?: number;
}

export interface ParseImportResult {
  headers: string[];
  mapping: ColumnMapping;
  summary: ImportSummary;
  processed: ProcessedLead[];
}

/** Detecta o delimitador mais provável (`,` ou `;`) a partir da primeira linha. */
export function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return commas >= semis ? ',' : ';';
}

/** Parseia conteúdo CSV/texto colado. */
export function parseTextContent(
  content: string,
  options: ParseImportOptions = {}
): ParseImportResult {
  const delimiter = options.delimiter ?? detectDelimiter(content);
  const parsed = parseCsv(content, { delimiter, hasHeader: true });
  const mapping = identifyColumns(parsed.headers);
  const raw: RawLeadRecord[] = parsed.rows.map((row, idx) => {
    const rec: RawLeadRecord = { rowIndex: idx + 2 };
    parsed.headers.forEach((h, i) => {
      if (h) rec[h] = (row[i] ?? '').toString();
    });
    return rec;
  });
  return buildResult(parsed.headers, mapping, raw, options);
}

/** Parseia um arquivo .xlsx via buffer. */
export function parseXlsxBuffer(buffer: Buffer, options: ParseImportOptions = {}): ParseImportResult {
  // Import dinâmico para evitar carregar o xlsx no arranque
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    return { headers: [], mapping: identifyColumns([]), summary: emptySummary(), processed: [] };
  }

  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const mapping = identifyColumns(headers);
  const raw: RawLeadRecord[] = rows.map((row, idx) => ({ ...row, rowIndex: idx + 2 }));

  return buildResult(headers, mapping, raw, options);
}

/** Parseia um arquivo .csv a partir de buffer. */
export function parseCsvBuffer(buffer: Buffer, options: ParseImportOptions = {}): ParseImportResult {
  return parseTextContent(buffer.toString('utf-8'), options);
}

function buildResult(
  headers: string[],
  mapping: ColumnMapping,
  raw: RawLeadRecord[],
  options: ParseImportOptions
): ParseImportResult {
  let limited = raw;
  if (options.maxRows && options.maxRows > 0 && raw.length > options.maxRows) {
    logger.warn(`Limitando importação a ${options.maxRows} registros (modo teste)`);
    limited = raw.slice(0, options.maxRows);
  }

  const { processed } = processRecords(limited, mapping, options.existing ?? []);

  const summary = summarize(processed);

  return { headers, mapping, summary, processed };
}

export function summarize(processed: ProcessedLead[]): ImportSummary {
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;
  let newLeads = 0;
  const errorsByRow: Record<number, string[]> = {};

  for (const p of processed) {
    if (p.status === 'INVALID') {
      invalid += 1;
      errorsByRow[p.rowIndex] = p.errors;
    } else if (p.status === 'DUPLICATE') {
      duplicates += 1;
    } else {
      valid += 1;
      newLeads += 1;
    }
  }

  return {
    total: processed.length,
    valid,
    invalid,
    duplicates,
    newLeads,
    rows: processed,
    errorsByRow,
  };
}

function emptySummary(): ImportSummary {
  return {
    total: 0,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    newLeads: 0,
    rows: [],
    errorsByRow: {},
  };
}

/** Carrega fingerprints existentes da base via Prisma, escopado à empresa. */
export async function loadExistingFingerprints(
  prisma: import('@prospector/database').PrismaClient,
  businessId?: string | null
): Promise<ExistingLeadKey[]> {
  const leads = await prisma.lead.findMany({
    where: businessId ? { business_id: businessId } : {},
    select: {
      fingerprint_phone: true,
      fingerprint_email: true,
      fingerprint_extid: true,
    },
  });
  return leads.map((l) => ({
    phone: l.fingerprint_phone,
    email: l.fingerprint_email,
    externalId: l.fingerprint_extid,
  }));
}

/** Normaliza um registro já validado para inserção no banco. */
export function toLeadCreateInput(processed: ProcessedLead, source: string, businessId: string) {
  return {
    name: processed.name,
    phone: processed.phone,
    email: processed.email,
    business_name: processed.businessName,
    city: processed.city,
    state: processed.state,
    external_id: processed.externalId,
    source: source as 'CSV' | 'MANUAL' | 'TEST',
    fingerprint_phone: processed.fingerprints.phone ?? null,
    fingerprint_email: processed.fingerprints.email ?? null,
    fingerprint_extid: processed.fingerprints.extid ?? null,
    business_id: businessId,
  };
}

export { normalizeRecord };

/**
 * Persiste leads no banco (dedup reavaliado contra a base) e, se houver
 * campanha, cria os vínculos CampaignLead.
 * - Leads NOVOS são criados;
 * - Leads DUPLICADOS (já existentes) são vinculados à campanha selecionada,
 *   permitindo reimportar uma lista para adicionar os leads existentes.
 */
export async function persistLeads(
  prisma: import('@prospector/database').PrismaClient,
  records: ProcessedLead[],
  options: { campaignId?: string; source?: 'CSV' | 'MANUAL' | 'TEST'; importId?: string; businessId: string }
): Promise<{ inserted: number; skipped: number; linkedDuplicates: number }> {
  let skipped = 0;
  let linkedDuplicates = 0;
  const creates: ReturnType<typeof toLeadCreateInput>[] = [];
  const toInsert: ProcessedLead[] = [];
  const toLinkExisting: ProcessedLead[] = [];

  // Carrega fingerprints existentes uma única vez (escopado à empresa)
  const existing = await loadExistingFingerprints(prisma, options.businessId);
  const phoneSet = new Set(existing.map((e) => e.phone).filter(Boolean) as string[]);
  const emailSet = new Set(existing.map((e) => e.email).filter(Boolean) as string[]);
  const extSet = new Set(existing.map((e) => e.externalId).filter(Boolean) as string[]);

  // Filtro de empresa para as buscas por fingerprint (composto de unicidade)
  const whereScope: Record<string, unknown> = { business_id: options.businessId };
  const scopedCond = (cond: Record<string, unknown>): Record<string, unknown> => ({
    ...whereScope,
    ...cond,
  });
  const campaignConst = (): { business_id: string } => ({ business_id: options.businessId });

  const alreadySeenPhone = new Set<string>();
  const alreadySeenEmail = new Set<string>();
  const alreadySeenExt = new Set<string>();

  for (const record of records) {
    if (record.status === 'INVALID') {
      skipped += 1;
      continue;
    }

    const { phone, email, extid } = record.fingerprints;
    const isDup =
      (phone != null && (phoneSet.has(phone) || alreadySeenPhone.has(phone))) ||
      (email != null && !phone && (emailSet.has(email) || alreadySeenEmail.has(email))) ||
      (extid != null && !phone && !email && (extSet.has(extid) || alreadySeenExt.has(extid)));

    if (isDup) {
      // Já existe: se houver campanha, vincula o lead existente a ela
      skipped += 1;
      if (options.campaignId) toLinkExisting.push(record);
      continue;
    }

    if (phone) alreadySeenPhone.add(phone);
    if (email) alreadySeenEmail.add(email);
    if (extid) alreadySeenExt.add(extid);

    creates.push(toLeadCreateInput(record, options.source ?? 'CSV', options.businessId));
    toInsert.push(record);
  }

  let inserted = 0;
  if (creates.length) {
    await prisma.lead.createMany({
      data: creates.map((c) => ({ ...c, status: 'PENDING', ...(options.importId ? { imported_via_id: options.importId } : {}) })),
      skipDuplicates: true,
    });

    // Recupera os ids criados
    const or: Record<string, unknown>[] = [];
    for (const record of toInsert) {
      const cond: Record<string, unknown> = {};
      if (record.fingerprints.phone) cond.fingerprint_phone = record.fingerprints.phone;
      else if (record.fingerprints.email) cond.fingerprint_email = record.fingerprints.email;
      else if (record.fingerprints.extid) cond.fingerprint_extid = record.fingerprints.extid;
      if (Object.keys(cond).length) or.push(scopedCond(cond));
    }
    const created = or.length ? await prisma.lead.findMany({ where: { OR: or }, select: { id: true } }) : [];
    inserted = created.length;

    // Cria vínculos de campanha para os NOVOS
    if (options.campaignId && created.length) {
      await prisma.campaignLead.createMany({
        data: created.map((lead) => ({ campaign_id: options.campaignId as string, lead_id: lead.id, status: 'PENDING', ...campaignConst() })),
        skipDuplicates: true,
      });
    }
    skipped = skipped + (creates.length - inserted);
  }

  // Vincula os leads DUPLICADOS (já existentes) à campanha selecionada
  if (options.campaignId && toLinkExisting.length) {
    const dupOr: Record<string, unknown>[] = [];
    for (const record of toLinkExisting) {
      const cond: Record<string, unknown> = {};
      if (record.fingerprints.phone) cond.fingerprint_phone = record.fingerprints.phone;
      else if (record.fingerprints.email) cond.fingerprint_email = record.fingerprints.email;
      else if (record.fingerprints.extid) cond.fingerprint_extid = record.fingerprints.extid;
      if (Object.keys(cond).length) dupOr.push(scopedCond(cond));
    }
    if (dupOr.length) {
      const existingLeads = await prisma.lead.findMany({ where: { OR: dupOr }, select: { id: true } });
      const result = await prisma.campaignLead.createMany({
        data: existingLeads.map((lead) => ({ campaign_id: options.campaignId as string, lead_id: lead.id, status: 'PENDING', ...campaignConst() })),
        skipDuplicates: true,
      });
      linkedDuplicates = result.count;
    }
  }

  return { inserted, skipped, linkedDuplicates };
}
