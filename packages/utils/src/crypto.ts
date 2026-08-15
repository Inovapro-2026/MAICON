import { createHash, randomBytes } from 'crypto';

/** Hash SHA-256 em hex. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Token aleatório em hex. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** ID curto para logs/eventos. */
export function shortId(prefix = ''): string {
  const raw = randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${raw}` : raw;
}
