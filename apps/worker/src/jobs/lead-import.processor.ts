import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { RawLeadRecord } from '@prospector/types';
import { loadExistingFingerprints, persistLeads, processRecords } from '@prospector/leads';
import { identifyColumns, normalizeRecord } from '@prospector/leads';

const logger = createLogger('worker.lead-import');

interface LeadImportJobData {
  importId: string;
  businessId: string;
  campaignId?: string;
  source: 'CSV' | 'PASTE' | 'XLSX' | 'TEST';
  records: RawLeadRecord[];
  isTest?: boolean;
}

export async function processLeadImport(job: { id?: string; data: LeadImportJobData }): Promise<void> {
  const { importId, businessId, campaignId, source, records, isTest } = job.data;

  await prisma.leadImport.update({ where: { id: importId }, data: { status: 'PROCESSING' } });
  logger.info('Processando importação de leads', {
    import_id: importId,
    business_id: businessId,
    campaign_id: campaignId,
    records: records.length,
    source,
  });

  try {
    const existing = await loadExistingFingerprints(prisma, businessId);

    // Mapeamento canônico: os registros já vêm normalizados na prévia
    const mapping = identifyColumns(['nome', 'telefone', 'email', 'estabelecimento', 'cidade', 'estado', 'id']);
    const rawRecords: RawLeadRecord[] = records.map((r) => ({
      rowIndex: r.rowIndex,
      nome: r.name ?? '',
      telefone: r.phone ?? '',
      email: r.email ?? '',
      estabelecimento: r.businessName ?? '',
      cidade: r.city ?? '',
      estado: r.state ?? '',
      id: r.externalId ?? '',
    }));

    // Reprocessa (valida + deduplica contra a base atual)
    const { processed } = processRecords(rawRecords, mapping, existing);

    const result = await persistLeads(prisma, processed, {
      campaignId,
      source: isTest ? 'TEST' : (source === 'PASTE' || source === 'XLSX' ? 'CSV' : source),
      importId,
      businessId,
    });

    await prisma.leadImport.update({
      where: { id: importId },
      data: {
        status: 'DONE',
        new_leads: result.inserted,
        summary: {
          total: records.length,
          inserted: result.inserted,
          skipped: result.skipped,
          linked_duplicates: result.linkedDuplicates,
          duplicates: records.length - result.inserted,
          invalid: 0,
        },
      },
    });

    logger.info('Importação concluída', {
      import_id: importId,
      business_id: businessId,
      inserted: result.inserted,
      skipped: result.skipped,
      linked_duplicates: result.linkedDuplicates,
      campaign_id: campaignId,
    });
  } catch (error) {
    await prisma.leadImport.update({
      where: { id: importId },
      data: { status: 'FAILED' },
    });
    logger.error('Falha ao processar importação', { import_id: importId, error });
    throw error;
  }
}
