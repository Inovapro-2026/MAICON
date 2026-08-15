import { createLogger } from '@prospector/logger';
import { createHmac, timingSafeEqual } from 'crypto';

const logger = createLogger('email.webhook');

export interface ParsedWebhook {
  event: 'delivery' | 'open' | 'click' | 'bounce' | 'complaint' | 'sent' | 'unknown';
  externalId: string | null;
  to: string | null;
  payload: unknown;
}

/**
 * Traduz o payload do webhook do Resend em um evento interno.
 * Payload de exemplo (v2): { "type": "email.delivered", "data": { "email_id": "...", ... } }
 */
export function parseResendWebhook(payload: unknown): ParsedWebhook {
  const p = (payload ?? {}) as Record<string, unknown>;
  const type = String(p.type ?? '');
  const data = (p.data ?? {}) as Record<string, unknown>;

  const toList = Array.isArray(data.to) ? (data.to as string[]) : [];
  const to = toList[0] ?? (typeof data.to === 'string' ? data.to : null);

  let event: ParsedWebhook['event'] = 'unknown';
  if (type.includes('delivered')) event = 'delivery';
  else if (type.includes('opened')) event = 'open';
  else if (type.includes('clicked')) event = 'click';
  else if (type.includes('bounced')) event = 'bounce';
  else if (type.includes('complained')) event = 'complaint';
  else if (type.includes('sent')) event = 'sent';

  return {
    event,
    externalId: (data.email_id as string) ?? null,
    to,
    payload,
  };
}

/**
 * Verifica a assinatura do webhook do Resend (HMAC-SHA256).
 * Requer RESEND_WEBHOOK_SECRET. Retorna true se ausente (modo permissivo em dev).
 */
export function verifyResendSignature(
  signingSecret: string | undefined,
  body: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined
): boolean {
  if (!signingSecret || !signatureHeader || !timestampHeader) {
    logger.warn('Webhook Resend sem secret de assinatura configurado — aceitando sem verificação');
    return true;
  }
  try {
    const signedPayload = `${timestampHeader}.${body}`;
    const expected = createHmac('sha256', signingSecret).update(signedPayload).digest('base64');
    const given = Buffer.from(signatureHeader);
    const expectedBuf = Buffer.from(expected);
    return timingSafeEqual(given, expectedBuf);
  } catch {
    return false;
  }
}
