import { Router, Request, Response } from 'express';
import { config } from '@prospector/config';
import { prisma } from '@prospector/database';
import { asyncHandler, ok } from '../lib/http';

export const healthRouter = Router();

/** GET /health — liveness + status de dependências. */
healthRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }

    const status = db === 'ok' ? 200 : 503;
    return res.status(status).json({
      success: db === 'ok',
      service: 'api',
      version: '1.0.0',
      env: config.env,
      uptime: process.uptime(),
      dependencies: { database: db, redis: 'checked-at-runtime' },
    });
  })
);
