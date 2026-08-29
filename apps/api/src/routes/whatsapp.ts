import { Router, Request, Response } from 'express';
import { config } from '@prospector/config';
import { createLogger } from '@prospector/logger';
import { asyncHandler, ok } from '../lib/http';
import { requireAuth, requireBusiness, requireRole } from '../middleware/auth';

const logger = createLogger('api.whatsapp');

export const whatsappRouter = Router();

whatsappRouter.use(requireAuth, requireBusiness);

/** Proxy para o worker, que detém a conexão Baileys. */
export async function proxyToWorker(path: string, req: Request, method = 'GET'): Promise<unknown> {
  const businessId = req.user?.businessId;
  let url = `${config.app.workerBaseUrl}${path}`;
  const body = method === 'GET' ? undefined : JSON.stringify({ ...(req.body ?? {}), businessId });
  if (method === 'GET' && businessId) {
    url = `${url}${url.includes('?') ? '&' : '?'}businessId=${encodeURIComponent(businessId)}`;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-worker-token': config.app.apiToken,
    },
    body,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Worker: HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  // O worker responde { success, data }; extrai apenas o payload
  const workerPayload = data as { data?: unknown };
  return workerPayload?.data ?? data;
}

/** GET /whatsapp/status — estado da conexão. */
whatsappRouter.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const data = await proxyToWorker('/whatsapp/status', _req);
      return ok(res, data);
    } catch (error) {
      logger.warn('Worker indisponível', { error });
      return ok(res, { connected: false, state: 'worker_unavailable', lastError: 'Worker offline', qrAvailable: false, qr: null, loggedIn: false, phone: null });
    }
  })
);

/** GET /whatsapp/qr — QR code atual para pareamento. */
whatsappRouter.get(
  '/qr',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const data = await proxyToWorker('/whatsapp/qr', _req);
      return ok(res, data);
    } catch (error) {
      logger.warn('Worker indisponível para QR', { error });
      return ok(res, { qr: null, available: false });
    }
  })
);

/** POST /whatsapp/connect — solicita conexão (gera QR). */
whatsappRouter.post(
  '/connect',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await proxyToWorker('/whatsapp/connect', req, 'POST');
    return ok(res, data);
  })
);

/** POST /whatsapp/disconnect — encerra a sessão. */
whatsappRouter.post(
  '/disconnect',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await proxyToWorker('/whatsapp/disconnect', req, 'POST');
    return ok(res, data);
  })
);

/**
 * POST /whatsapp/clear-session — apaga TODOS os dados da sessão do WhatsApp
 * (força novo QR). Ação destrutiva: restrita a OWNER/BUSINESS_ADMIN.
 */
whatsappRouter.post(
  '/clear-session',
  requireRole(['OWNER', 'BUSINESS_ADMIN']),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await proxyToWorker('/whatsapp/clear-session', req, 'POST');
    logger.warn('Sessão WhatsApp limpa pelo painel', { business_id: req.user!.businessId });
    return ok(res, data);
  })
);
