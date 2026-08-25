import { Router, Request, Response } from 'express';
import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok } from '../lib/http';
import { requireAuth, requireBusiness } from '../middleware/auth';

const logger = createLogger('api.notifications');

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth, requireBusiness);

/**
 * GET /notifications — lista as notificações da empresa com contagem de não lidas.
 * Isolamento multi-tenant: apenas notificações da empresa da sessão.
 */
notificationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 50)));

    const where = { business_id: businessId };

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, read: false } }),
      prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok(res, {
      total,
      unreadCount,
      notifications,
    });
  })
);

/**
 * PATCH /notifications/:id/read — marca uma notificação específica como lida.
 */
notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const id = String(req.params.id);

    const notification = await prisma.notification.findFirst({
      where: { id, business_id: businessId },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notificação não encontrada' },
      });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true, read_at: new Date() },
    });

    return ok(res, { notification: updated });
  })
);

/**
 * POST /notifications/mark-all-read — marca todas as notificações não lidas da empresa como lidas.
 */
notificationsRouter.post(
  '/mark-all-read',
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    const result = await prisma.notification.updateMany({
      where: { business_id: businessId, read: false },
      data: { read: true, read_at: new Date() },
    });

    logger.info('Todas as notificações marcadas como lidas', {
      business_id: businessId,
      count: result.count,
    });

    return ok(res, { count: result.count });
  })
);
