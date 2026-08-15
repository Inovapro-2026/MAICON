import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { RawLeadRecord } from '@prospector/types';
import { loadExistingFingerprints as loadExistingFingerprintsBase, parseCsvBuffer, parseTextContent, parseXlsxBuffer } from '@prospector/leads';
import { asyncHandler, ok, ApiError } from '../lib/http';
import { requireAuth, requireBusiness, requireRole } from '../middleware/auth';
import { uploadCsv } from '../middleware/upload';
import { getQueue } from '../services/queues';
import { QUEUE_NAMES } from '@prospector/queues';
import { config } from '@prospector/config';
import { getPreview, savePreview } from '../services/preview-store';
import { countImportedLeads, clearImportedLeads } from '../services/deletion-service';

const logger = createLogger('api.leads');

const loadExistingFingerprints = loadExistingFingerprintsBase as unknown as (
  client: import('@prospector/database').PrismaClient,
  businessId?: string | null
) => Promise<Awaited<ReturnType<typeof loadExistingFingerprintsBase>>>;

export const leadsRouter = Router();

leadsRouter.use(requireAuth);
leadsRouter.use(requireBusiness);

/**
 * POST /leads/import/preview
 * Multipart com campo "file" OU JSON { text: "...CSV colado..." }.
 * Retorna a prévia com contagens (total, válidos, duplicados, inválidos, novos).
 */
leadsRouter.post(
  '/import/preview',
  uploadCsv.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const existing = await loadExistingFingerprints(prisma, businessId);
    const testMode = Boolean(req.body?.test_mode === 'true' || req.body?.test_mode === true);
    const maxRows = testMode ? config.campaign.testModeMaxLeads : undefined;

    let result:
      | { filename: string; source: 'CSV' | 'XLSX' | 'PASTE'; summary: import('@prospector/types').ImportSummary }
      | undefined;

    if (req.file) {
      const filename = req.file.originalname;
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'xlsx' || ext === 'xls') {
        const parsed = parseXlsxBuffer(req.file.buffer, { existing, maxRows });
        result = {
          filename,
          source: 'XLSX',
          summary: parsed.summary,
        };
      } else {
        const parsed = parseCsvBuffer(req.file.buffer, { existing, maxRows });
        result = {
          filename,
          source: 'CSV',
          summary: parsed.summary,
        };
      }
    } else if (typeof req.body?.text === 'string' && req.body.text.trim()) {
      const parsed = parseTextContent(req.body.text, { existing, maxRows });
      result = {
        filename: 'texto-colado.csv',
        source: 'PASTE',
        summary: parsed.summary,
      };
    }

    if (!result) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Envie um arquivo .csv/.xlsx ou texto CSV no corpo (campo "text")' } });
    }

    const importId = savePreview({
      filename: result.filename,
      source: result.source,
      summary: result.summary,
      processed: result.summary.rows,
    });

    logger.info('Prévia de importação calculada', {
      import_id: importId,
      total: result.summary.total,
      valid: result.summary.valid,
      duplicates: result.summary.duplicates,
      invalid: result.summary.invalid,
      test_mode: Boolean(testMode),
    });

    return ok(res, { importId, filename: result.filename, ...result.summary });
  })
);

/**
 * POST /leads/import/confirm
 * Body: { importId, campaignId?, isTest? }
 * Enfileira o processamento da importação (gravação no banco).
 */
leadsRouter.post(
  '/import/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const { importId, campaignId, isTest } = req.body ?? {};
    const preview = getPreview(String(importId ?? ''));

    if (!preview) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prévia de importação não encontrada ou expirada. Refaça o upload.' } });
    }

    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: String(campaignId), business_id: businessId } });
      if (!campaign) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada' } });
      }
    }

    const leadImport = await prisma.leadImport.create({
      data: {
        business_id: businessId,
        filename: preview.filename,
        source: preview.source,
        status: 'QUEUED',
        summary: {
          total: preview.summary.total,
          valid: preview.summary.valid,
          duplicates: preview.summary.duplicates,
          invalid: preview.summary.invalid,
          newLeads: preview.summary.newLeads,
          testMode: Boolean(isTest),
        },
        total: preview.summary.total,
        new_leads: preview.summary.newLeads,
        duplicates: preview.summary.duplicates,
        invalid: preview.summary.invalid,
      },
    });

    // Reconstitui registros crus a partir da prévia processada.
    // Inclui NOVOS e DUPLICADOS: os duplicados (já existentes) serão vinculados
    // à campanha selecionada na confirmação.
    const records: RawLeadRecord[] = preview.processed
      .filter((p) => p.status === 'NEW' || p.status === 'DUPLICATE')
      .map((p) => ({
        rowIndex: p.rowIndex,
        name: p.name ?? undefined,
        phone: p.phone ?? undefined,
        email: p.email ?? undefined,
        businessName: p.businessName ?? undefined,
        city: p.city ?? undefined,
        state: p.state ?? undefined,
        externalId: p.externalId ?? undefined,
      }));

    await getQueue(QUEUE_NAMES.LEAD_IMPORT).add(
      'import',
      {
        importId: leadImport.id,
        campaignId: campaignId || undefined,
        source: isTest ? 'TEST' : (preview.source as 'CSV' | 'PASTE' | 'XLSX'),
        records,
        isTest: Boolean(isTest),
        businessId,
      },
      { jobId: `import-${leadImport.id}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );

    logger.info('Importação enfileirada', {
      import_id: leadImport.id,
      campaign_id: campaignId,
      records: records.length,
      isTest: Boolean(isTest),
    });

    return ok(res, {
      importId: leadImport.id,
      queued: records.length,
      duplicates: preview.summary.duplicates,
      invalid: preview.summary.invalid,
      message: `Importação de ${records.length} leads enfileirada`,
    }, 202);
  })
);

/** GET /leads/imports — histórico de importações. */
leadsRouter.get(
  '/imports',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const imports = await prisma.leadImport.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return ok(res, imports);
  })
);

/**
 * GET /leads/imported/count — contagens de leads importados para a confirmação
 * reforçada da UI ("Limpar leads importados").
 */
leadsRouter.get(
  '/imported/count',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const counts = await countImportedLeads(businessId);
    return ok(res, counts);
  })
);

/**
 * DELETE /leads/imported — apaga TODOS os leads importados da empresa atual
 * (source != MANUAL), cascateando conversas, mensagens, opt-outs e gerações de IA.
 * Ação destrutiva de alto risco: restrita a OWNER/BUSINESS_ADMIN, com
 * confirmação reforçada na UI e registro em AuditLog.
 */
leadsRouter.delete(
  '/imported',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const result = await clearImportedLeads(businessId, { sub: req.user!.sub });
    logger.warn('Leads importados apagados', {
      business_id: businessId,
      ...result,
    });
    return ok(res, result);
  })
);

/** GET /leads — listagem com filtros e paginação. */
leadsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    const where: Record<string, unknown> = { business_id: businessId };
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { business_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { messages: true, conversations: true } } },
      }),
    ]);

    return ok(res, { total, page, pageSize, leads });
  })
);

/** GET /leads/:id — detalhe. */
leadsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const lead = await prisma.lead.findFirst({
      where: { id: String(req.params.id), business_id: businessId },
      include: {
        messages: { orderBy: { created_at: 'desc' }, take: 20 },
        opt_outs: true,
      },
    });
    if (!lead) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead não encontrado' } });
    return ok(res, lead);
  })
);

/** Garante contexto de empresa ativo para os handlers de leads. */
function requireBusinessId(req: Request): string {
  const businessId = req.user?.businessId;
  if (!businessId) {
    throw new ApiError(403, 'FORBIDDEN', 'Nenhuma empresa selecionada');
  }
  return businessId;
}
