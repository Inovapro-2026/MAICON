import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { sha256 } from '@prospector/utils';
import { config } from '@prospector/config';
import { encrypt, decrypt } from './encryption';

const logger = createLogger('api.api-keys');

export type ApiKeyProvider = 'elevenlabs' | 'groq' | 'openai';

const CACHE_TTL_MS = 60_000;

interface CachedKey {
  key: string;
  expiresAt: number;
}

// Cache em memória: provider -> { key, expiresAt } (apenas a chave ativa).
const cache = new Map<ApiKeyProvider, CachedKey>();

export interface ApiKeyInfo {
  id: string;
  provider: ApiKeyProvider;
  label: string | null;
  key_suffix: string;
  status: string;
  last_error: string | null;
  used_at: Date | null;
  created_at: Date;
}

function mask(key: string): string {
  const trimmed = key.trim();
  return trimmed.length <= 4 ? trimmed : `...${trimmed.slice(-4)}`;
}

function invalidateCache(provider: ApiKeyProvider): void {
  cache.delete(provider);
}

/** Busca a chave ativa de um provedor, com cache de 60s. */
export async function getActiveApiKey(provider: ApiKeyProvider): Promise<string | null> {
  const cached = cache.get(provider);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  const rows = await prisma.apiKey.findMany({
    where: { provider, status: 'ACTIVE' },
    orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
    take: 1,
  });

  if (rows.length === 0) {
    cache.delete(provider);
    return null;
  }

  const plain = decrypt(rows[0].key_encrypted);
  cache.set(provider, { key: plain, expiresAt: Date.now() + CACHE_TTL_MS });
  return plain;
}

/** Resolve a chave de um provedor: banco primeiro, .env como seed/fallback. */
export async function resolveApiKey(provider: ApiKeyProvider): Promise<string | null> {
  const fromDb = await getActiveApiKey(provider);
  if (fromDb) return fromDb;

  // Seed/fallback: valores do .env, mantidos apenas para compatibilidade inicial.
  if (provider === 'elevenlabs') return config.ai.elevenlabsApiKey || null;
  if (provider === 'groq') return config.ai.groqApiKey || null;
  return config.ai.openaiApiKey || null;
}

/** Marca uma chave como esgotada/com erro (ex.: quota excedida) e invalida o cache. */
export async function markApiKeyExhausted(
  provider: ApiKeyProvider,
  key: string,
  reason: string,
): Promise<void> {
  invalidateCache(provider);
  const hash = sha256(key);
  const row = await prisma.apiKey.findFirst({ where: { provider, key_hash: hash } });
  if (row) {
    await prisma.apiKey.update({
      where: { id: row.id },
      data: { status: 'EXHAUSTED', last_error: reason.slice(0, 500), used_at: new Date() },
    });
    logger.warn('Chave de API marcada como esgotada', {
      provider,
      key_suffix: row.key_suffix,
      reason: reason.slice(0, 200),
    });
  }
}

/** Lista as chaves de um provedor (ou todas) — nunca expõe o valor completo. */
export async function listApiKeys(provider?: ApiKeyProvider): Promise<ApiKeyInfo[]> {
  const rows = await prisma.apiKey.findMany({
    where: provider ? { provider } : {},
    orderBy: [{ provider: 'asc' }, { priority: 'asc' }, { created_at: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider as ApiKeyProvider,
    label: r.label,
    key_suffix: r.key_suffix,
    status: r.status,
    last_error: r.last_error,
    used_at: r.used_at,
    created_at: r.created_at,
  }));
}

/** Adiciona uma chave criptografada. */
export async function addApiKey(
  provider: ApiKeyProvider,
  key: string,
  label?: string | null,
): Promise<ApiKeyInfo> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error('Informe o valor da chave');
  const hash = sha256(trimmed);
  const existing = await prisma.apiKey.findFirst({ where: { key_hash: hash } });
  if (existing) throw new Error('Esta chave já está cadastrada');

  const row = await prisma.apiKey.create({
    data: {
      provider,
      label: label?.trim() ? label.trim().slice(0, 60) : null,
      key_encrypted: encrypt(trimmed),
      key_hash: hash,
      key_suffix: mask(trimmed),
      status: 'ACTIVE',
      priority: await nextPriority(provider),
    },
  });
  invalidateCache(provider);
  return {
    id: row.id,
    provider: row.provider as ApiKeyProvider,
    label: row.label,
    key_suffix: row.key_suffix,
    status: row.status,
    last_error: row.last_error,
    used_at: row.used_at,
    created_at: row.created_at,
  };
}

async function nextPriority(provider: ApiKeyProvider): Promise<number> {
  const max = await prisma.apiKey.aggregate({
    where: { provider },
    _max: { priority: true },
  });
  return (max._max.priority ?? -1) + 1;
}

/** Remove uma chave (restrito a PLATFORM_ADMIN). */
export async function removeApiKey(id: string): Promise<boolean> {
  const row = await prisma.apiKey.findUnique({ where: { id } });
  if (!row) return false;
  await prisma.apiKey.delete({ where: { id } });
  invalidateCache(row.provider as ApiKeyProvider);
  return true;
}