import IORedis from 'ioredis';
import { config } from '@prospector/config';
import { createLogger } from '@prospector/logger';

const logger = createLogger('api.redis');

/**
 * Cliente Redis dedicado (ioredis) para chaves de coordenação do pump de campanhas.
 */
export const redisClient = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisClient.on('error', (error) => {
  logger.error('Erro no cliente Redis da API', { error: error.message });
});

export const PUMP_RUN_KEY = (campaignId: string): string => `campaign:pump:run:${campaignId}`;
export const NEXT_SEND_KEY = (campaignId: string): string => `campaign:next-send:${campaignId}`;
