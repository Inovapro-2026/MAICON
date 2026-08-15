/**
 * Logger estruturado do SAVYRON.
 * Emite JSON com timestamp, nível, serviço e contexto (lead_id, campaign_id, ...).
 * Em desenvolvimento imprime human-readable para o console.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
  service?: string;
  lead_id?: string;
  leadId?: string;
  campaign_id?: string;
  campaignId?: string;
  message_id?: string;
  conversation_id?: string;
  job_id?: string;
  channel?: 'WHATSAPP' | 'EMAIL' | 'SYSTEM';
  error?: unknown;
  duration_ms?: number;
  provider?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): number {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVEL_PRIORITY[raw as LogLevel] ?? LEVEL_PRIORITY.info;
}

function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val as object)) return '[Circular]';
        seen.add(val as object);
      }
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (typeof val === 'bigint') return val.toString();
      return val;
    });
  } catch {
    return String(value);
  }
}

export class Logger {
  readonly service: string;
  private minLevel: number;

  constructor(service: string) {
    this.service = service;
    this.minLevel = envLevel();
  }

  private emit(level: LogLevel, message: string, context: LogContext = {}): void {
    if (LEVEL_PRIORITY[level] < this.minLevel) return;

    let error: unknown;
    if (context.error !== undefined) {
      error = context.error;
      context = { ...context, error: undefined };
    }

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...context,
    };
    if (error !== undefined) entry.error = normalizeError(error);

    const line = safeStringify(entry);

    if (process.env.NODE_ENV === 'development' || !process.env.LOG_JSON) {
      const color = colorFor(level);
      const ctx = Object.entries(entry)
        .filter(([k]) => !['timestamp', 'level', 'service', 'message'].includes(k))
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : safeStringify(v)}`)
        .join(' ');
      const output = `\x1b[2m${entry.timestamp}\x1b[0m ${color}${level.toUpperCase().padEnd(5)}\x1b[0m [${this.service}] ${message}${ctx ? ` ${ctx}` : ''}`;
      if (level === 'error') console.error(output);
      else if (level === 'warn') console.warn(output);
      else console.log(output);
    } else if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.emit('debug', message, context);
  }
  info(message: string, context?: LogContext): void {
    this.emit('info', message, context);
  }
  warn(message: string, context?: LogContext): void {
    this.emit('warn', message, context);
  }
  error(message: string, context?: LogContext): void {
    this.emit('error', message, context);
  }
}

function normalizeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>;
    return {
      name: 'Error',
      message: typeof rec.message === 'string' ? rec.message : safeStringify(err),
      stack: typeof rec.stack === 'string' ? rec.stack : undefined,
      ...rec,
    };
  }
  return { name: 'Error', message: String(err) };
}

function colorFor(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return '\x1b[90m';
    case 'info':
      return '\x1b[36m';
    case 'warn':
      return '\x1b[33m';
    case 'error':
      return '\x1b[31m';
  }
}

export function createLogger(service: string): Logger {
  return new Logger(service);
}

export const rootLogger = new Logger('root');
