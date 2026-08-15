import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';

const logger = createLogger('api.emails');

export const emailsRouter = Router();

emailsRouter.use(requireAuth, requireBusiness);

/**
 * GET /emails — histórico de e-mails enviados pela empresa (via Resend).
 * Filtros: status (SENT|FAILED|BOUNCED), período (from/to, ISO).
 * Isolamento multi-tenant: apenas e-mails da empresa da sessão.
 */
emailsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 50)));
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const where: Record<string, unknown> = { business_id: businessId };
    if (status && ['SENT', 'FAILED', 'BOUNCED'].includes(status)) where.status = status;
    if (from && !Number.isNaN(Date.parse(from))) {
      where.sent_at = { ...(where.sent_at as Record<string, unknown> ?? {}), gte: new Date(from) };
    }
    if (to && !Number.isNaN(Date.parse(to))) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.sent_at = { ...(where.sent_at as Record<string, unknown> ?? {}), lte: end };
    }

    const [total, emails] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        orderBy: { sent_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok(res, { total, page, pageSize, emails });
  })
);
