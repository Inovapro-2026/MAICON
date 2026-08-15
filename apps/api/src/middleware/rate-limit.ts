import { NextFunction, Request, Response } from 'express';
import { config } from '@prospector/config';
import { ApiError } from '../lib/http';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Rate limiter em memória por IP (Janela deslizante simples). */
export function rateLimit(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs ?? config.security.rateLimitWindowMs;
  const max = options?.max ?? config.security.rateLimitMax;

  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      return next(ApiError.tooManyRequests(`Aguarde ${retryAfter}s antes de tentar novamente`));
    }
    return next();
  };
}

export function cleanupBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
