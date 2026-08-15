import { Router, Request, Response } from 'express';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';
import { getDashboardMetrics } from '../services/dashboard-service';
import { getBusinessSettings, setBusinessSettings } from '../services/settings';

const logger = createLogger('api.dashboard');

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireBusiness);

/** GET /dashboard/metrics — KPIs da página inicial. */
dashboardRouter.get(
  '/metrics',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const metrics = await getDashboardMetrics(businessId);
    return ok(res, metrics);
  })
);

/** GET /dashboard/settings — limites e intervalo atuais. */
dashboardRouter.get(
  '/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const settings = await getBusinessSettings(businessId);
    return ok(res, {
      whatsapp_daily_limit: settings?.whatsapp_daily_limit ?? 30,
      email_daily_limit: settings?.email_daily_limit ?? 100,
      interval_seconds: settings?.interval_seconds ?? 7200,
      test_mode_max_leads: settings?.test_mode_max_leads ?? 5,
    });
  })
);

/** PUT /dashboard/settings — atualiza limites diários e intervalo. */
dashboardRouter.put(
  '/settings',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const { whatsapp_daily_limit, email_daily_limit, interval_seconds } = req.body ?? {};

    await setBusinessSettings(businessId, {
      ...(whatsapp_daily_limit !== undefined ? { whatsapp_daily_limit: Math.max(1, Math.min(500, Number(whatsapp_daily_limit))) } : {}),
      ...(email_daily_limit !== undefined ? { email_daily_limit: Math.max(1, Math.min(2000, Number(email_daily_limit))) } : {}),
      ...(interval_seconds !== undefined ? { interval_seconds: Math.max(5, Math.min(86400, Number(interval_seconds))) } : {}),
    });

    logger.info('Configurações atualizadas', { business_id: businessId });
    return ok(res, { message: 'Configurações atualizadas' });
  })
);
