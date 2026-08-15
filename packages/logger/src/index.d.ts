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
export declare class Logger {
    readonly service: string;
    private minLevel;
    constructor(service: string);
    private emit;
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
}
export declare function createLogger(service: string): Logger;
export declare const rootLogger: Logger;
