import { NextFunction, Request, Response } from 'express';
import { createLogger } from '@prospector/logger';
import { ApiError } from '../lib/http';

const logger = createLogger('api.error');

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  const status = (error as { status?: number })?.status ?? 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : 'Requisição inválida',
        details: error instanceof Error ? error.message : String(error),
      },
    });
    return;
  }

  logger.error('Erro não tratado', {
    path: req.path,
    method: req.method,
    error,
  });

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
  });
}
