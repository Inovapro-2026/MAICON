import { Router, Request, Response } from 'express';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';
import { getReportMetrics } from '../services/report-service';

const logger = createLogger('api.reports');

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireBusiness);

/** GET /reports?from=YYYY-MM-DD&to=YYYY-MM-DD */
reportsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const fromRaw = String(req.query.from ?? '');
    const toRaw = String(req.query.to ?? '');
    const now = new Date();

    let from = new Date(fromRaw || now.toISOString().slice(0, 10));
    from.setUTCHours(0, 0, 0, 0);
    let to = new Date(toRaw || now.toISOString().slice(0, 10));
    to.setUTCHours(23, 59, 59, 999);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Datas inválidas. Use o formato YYYY-MM-DD.' } });
    }
    if (from > to) {
      [from, to] = [to, from];
    }

    const metrics = await getReportMetrics({ from, to }, req.user!.businessId!);
    logger.info('Relatório gerado', { from: from.toISOString(), to: to.toISOString() });
    return ok(res, metrics);
  })
);
