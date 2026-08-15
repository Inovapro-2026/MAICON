import IORedis from 'ioredis';
import { config } from '@prospector/config';

/**
 * Cliente Redis dedicado (ioredis) para locks/coordenação do pump.
 * O BullMQ já usa Redis; aqui usamos uma conexão própria para chaves auxiliares.
 */
export const redis = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const PUMP_RUN_KEY = (campaignId: string): string => `campaign:pump:run:${campaignId}`;
export const NEXT_SEND_KEY = (campaignId: string): string => `campaign:next-send:${campaignId}`;

// ---------------------------------------------------------------------------
// Locks distribuídos (coordenação entre workers/concorrência)
// ---------------------------------------------------------------------------

export const CONVERSATION_LOCK_KEY = (conversationId: string): string => `conv:lock:${conversationId}`;

const LOCK_TTL_MS = 30000;

/**
 * Tenta adquirir um lock atômico (SET NX EX). Retorna true se adquiriu.
 * Em falha do Redis, retorna true (fail-open) para não travar o atendimento.
 */
export async function acquireLock(key: string, ttlMs: number = LOCK_TTL_MS): Promise<boolean> {
  try {
    const result = await redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  } catch (error) {
    return true;
  }
}

/** Libera o lock (best-effort). */
export async function releaseLock(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    /* noop */
  }
}
