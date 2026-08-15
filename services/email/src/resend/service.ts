import { config } from '@prospector/config';
import { createLogger } from '@prospector/logger';

const logger = createLogger('email.resend');

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
  to: string;
  sentAt: string;
}

/**
 * Cliente de e-mail via Resend usando fetch nativo.
 * Quando a chave não está configurada, registra em "modo dry-run" (útil em dev/testes).
 */
export class ResendService {
  private readonly apiKey: string | undefined;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor() {
    this.apiKey = config.email.resendApiKey || undefined;
    this.fromEmail = config.email.fromEmail;
    this.fromName = config.email.fromName;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      logger.warn('Resend não configurado — dry-run (e-mail não enviado)', {
        to: params.to,
        subject: params.subject,
      });
      return {
        id: `dry-${Date.now()}`,
        to: params.to,
        sentAt: new Date().toISOString(),
      };
    }

    const started = Date.now();
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromEmail}>`,
          to: [params.to],
          subject: params.subject,
          text: params.text,
          ...(params.html ? { html: params.html } : {}),
          ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend: HTTP ${res.status} ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as { id: string };
      logger.info('E-mail enviado via Resend', {
        id: data.id,
        to: params.to,
        duration_ms: Date.now() - started,
      });
      return { id: data.id, to: params.to, sentAt: new Date().toISOString() };
    } catch (error) {
      logger.error('Falha ao enviar e-mail via Resend', {
        to: params.to,
        subject: params.subject,
        error,
      });
      throw error;
    }
  }
}

export const resendService = new ResendService();
