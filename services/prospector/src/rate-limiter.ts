/**
 * Rate limiter global compartilhado entre workers (via Redis).
 * - Global: janela deslizante por minuto sobre TODOS os tenants/workers.
 * - Por tenant: limite horário por empresa (preparado para planos futuros).
 * Usa um script Lua atômico para evitar corridas entre processos.
 */
import Redis from "ioredis";
import { createLogger } from "@prospector/logger";

const logger = createLogger("prospector.rate-limiter");

const ACQUIRE_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local n = redis.call('INCR', key)
if n == 1 then redis.call('EXPIRE', key, ttl) end
if n <= limit then return 1 end
redis.call('DECR', key)
return 0
`;

export interface RateLimiterOptions {
  redisUrl: string;
  globalPerMinute: number;
  globalWindowMs: number;
  tenantPerHour: number;
}

export interface AcquireResult {
  allowed: boolean;
  retryAfterMs: number;
}

/** Tolerância: tenta adquirir o slot até este número de vezes por chamada. */
const MAX_ACQUIRE_TRIES = 12;

export class RedisRateLimiter {
  private redis: Redis;
  private connected = false;
  private closed = false;

  constructor(private options: RateLimiterOptions) {
    // lazyConnect: construir o limiter NÃO abre conexão (sem efeitos colaterais
    // para testes/instâncias ociosas). A conexão só é aberta no primeiro uso.
    this.redis = new Redis(options.redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.redis.on("error", (err) => {
      logger.error("Erro no Redis do rate limiter", { error: err.message });
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected || this.closed) return;
    await this.redis.connect();
    this.connected = true;
  }

  private bucketKey(scope: string, now: number): string {
    const bucket = Math.floor(now / this.options.globalWindowMs);
    return `prospector:rl:${scope}:${bucket}`;
  }

  private async evalAcquire(key: string, limit: number): Promise<boolean> {
    const ttl = Math.ceil(this.options.globalWindowMs / 1000) + 10;
    // Usa EVAL com o script Lua diretamente (sempre carrega o código-fonte).
    // EVALSHA depende de o sha estar carregado no servidor — em Redis gerenciado/
    // proxy isso pode falhar com "Error compiling script ... malformed number
    // near '<sha>'", derrubando TODAS as requisições de descoberta. EVAL é
    // robusto aqui (o custo de recompilar o script curto é desprezível).
    const res = await this.redis.eval(ACQUIRE_LUA, 1, key, String(limit), String(ttl));
    return res === 1;
  }

  /** Tenta adquirir um slot global + do tenant. */
  async acquire(
    businessId: string,
    now: number = Date.now(),
  ): Promise<AcquireResult> {
    await this.ensureConnected();
    const globalKey = this.bucketKey("global", now);
    const tenantKey = this.bucketKey(`tenant:${businessId}`, now);
    const windowEnd =
      (Math.floor(now / this.options.globalWindowMs) + 1) *
      this.options.globalWindowMs;

    const globalOk = await this.evalAcquire(
      globalKey,
      this.options.globalPerMinute,
    );
    const tenantOk = await this.evalAcquire(
      tenantKey,
      this.options.tenantPerHour,
    );

    if (globalOk && tenantOk) return { allowed: true, retryAfterMs: 0 };

    return { allowed: false, retryAfterMs: Math.max(250, windowEnd - now) };
  }

  /** Aguarda até conseguir um slot (bloqueia o worker — intencional). */
  async wait(businessId: string): Promise<void> {
    for (let i = 0; i < MAX_ACQUIRE_TRIES; i += 1) {
      const result = await this.acquire(businessId);
      if (result.allowed) return;
      await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs));
    }
    // Esgotou tentativas na janela; aguarda mais um ciclo e tenta de novo.
    await this.wait(businessId);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.redis.quit().catch(() => undefined);
    } catch {
      // Nunca conectado — sem socket para fechar.
    }
    this.redis.disconnect();
  }
}
