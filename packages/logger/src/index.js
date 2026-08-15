"use strict";
/**
 * Logger estruturado do SAVYRON.
 * Emite JSON com timestamp, nível, serviço e contexto (lead_id, campaign_id, ...).
 * Em desenvolvimento imprime human-readable para o console.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rootLogger = exports.Logger = void 0;
exports.createLogger = createLogger;
const LEVEL_PRIORITY = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
function envLevel() {
    const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
    return LEVEL_PRIORITY[raw] ?? LEVEL_PRIORITY.info;
}
function safeStringify(value) {
    try {
        const seen = new WeakSet();
        return JSON.stringify(value, (_key, val) => {
            if (typeof val === 'object' && val !== null) {
                if (seen.has(val))
                    return '[Circular]';
                seen.add(val);
            }
            if (val instanceof Error) {
                return { name: val.name, message: val.message, stack: val.stack };
            }
            if (typeof val === 'bigint')
                return val.toString();
            return val;
        });
    }
    catch {
        return String(value);
    }
}
class Logger {
    service;
    minLevel;
    constructor(service) {
        this.service = service;
        this.minLevel = envLevel();
    }
    emit(level, message, context = {}) {
        if (LEVEL_PRIORITY[level] < this.minLevel)
            return;
        let error;
        if (context.error !== undefined) {
            error = context.error;
            context = { ...context, error: undefined };
        }
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            message,
            ...context,
        };
        if (error !== undefined)
            entry.error = normalizeError(error);
        const line = safeStringify(entry);
        if (process.env.NODE_ENV === 'development' || !process.env.LOG_JSON) {
            const color = colorFor(level);
            const ctx = Object.entries(entry)
                .filter(([k]) => !['timestamp', 'level', 'service', 'message'].includes(k))
                .map(([k, v]) => `${k}=${typeof v === 'string' ? v : safeStringify(v)}`)
                .join(' ');
            const output = `\x1b[2m${entry.timestamp}\x1b[0m ${color}${level.toUpperCase().padEnd(5)}\x1b[0m [${this.service}] ${message}${ctx ? ` ${ctx}` : ''}`;
            if (level === 'error')
                console.error(output);
            else if (level === 'warn')
                console.warn(output);
            else
                console.log(output);
        }
        else if (level === 'error') {
            console.error(line);
        }
        else {
            console.log(line);
        }
    }
    debug(message, context) {
        this.emit('debug', message, context);
    }
    info(message, context) {
        this.emit('info', message, context);
    }
    warn(message, context) {
        this.emit('warn', message, context);
    }
    error(message, context) {
        this.emit('error', message, context);
    }
}
exports.Logger = Logger;
function normalizeError(err) {
    if (err instanceof Error) {
        return { name: err.name, message: err.message, stack: err.stack };
    }
    if (typeof err === 'object' && err !== null) {
        const rec = err;
        return {
            name: 'Error',
            message: typeof rec.message === 'string' ? rec.message : safeStringify(err),
            stack: typeof rec.stack === 'string' ? rec.stack : undefined,
            ...rec,
        };
    }
    return { name: 'Error', message: String(err) };
}
function colorFor(level) {
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
function createLogger(service) {
    return new Logger(service);
}
exports.rootLogger = new Logger('root');
//# sourceMappingURL=index.js.map