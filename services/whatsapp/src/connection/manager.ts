/**
 * Gerenciador da conexão WhatsApp via Baileys.
 * Configuração replicada do projeto legado (Baileys v7):
 *  - resolve a versão do WA Web em runtime (evita ClientTooOld);
 *  - normaliza JIDs recebidos (cobre @lid / @s.whatsapp.net / device/agent);
 *  - responde usando o remoteJid exato recebido (essencial para @lid);
 *  - cache de signal key store e opções de socket compatíveis.
 */
import { config } from '@prospector/config';
import { createLogger } from '@prospector/logger';
import { EventEmitter } from 'events';
import { IncomingMessage, MessageReceivedHandler, WhatsAppConnectionState, WhatsAppStatus } from '../types';
import { loadSessionAuth, clearSessionFiles, DEFAULT_BUSINESS_SESSION, isLegacySession } from '../session/store';

const logger = createLogger('whatsapp.manager');

/** Cria um logger pino compatível com o Baileys, sem saída. */
function createSilentLogger(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pino = require('pino');
  return pino({ level: 'silent' });
}

const BAISLEYS_TIMEOUT_MS = 20000;
const SEND_TIMEOUT_MS = 20000;
const KEEP_ALIVE_MS = 25000;
const MAX_RECONNECT_ATTEMPTS = 8;

// --- Versão do WA Web (evita erro 405 ClientTooOld) ---
let waWebVersion: [number, number, number] | null = null;
let waWebVersionFetchedAt = 0;
const WA_WEB_VERSION_CACHE_MS = 6 * 60 * 60 * 1000;

function fallbackWaWebVersion(): [number, number, number] {
  return [2, 3000, 1044798975];
}

function parseLatestWaWebVersion(html: string): [number, number, number] | null {
  const re = /2\.[0-9]+\.([0-9]+)/g;
  let match: RegExpExecArray | null;
  let best: number | null = null;
  while ((match = re.exec(html)) !== null) {
    const build = parseInt(match[1], 10);
    if (best === null || build > best) best = build;
  }
  return best !== null ? [2, 3000, best] : null;
}

async function getWaWebVersion(): Promise<[number, number, number]> {
  if (waWebVersion && Date.now() - waWebVersionFetchedAt < WA_WEB_VERSION_CACHE_MS) {
    return waWebVersion;
  }
  try {
    const res = await fetch('https://wppconnect.io/whatsapp-versions/', {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const parsed = parseLatestWaWebVersion(await res.text());
      if (parsed) {
        waWebVersion = parsed;
        waWebVersionFetchedAt = Date.now();
        logger.info('Versão WA Web resolvida', { version: parsed.join('.') });
        return parsed;
      }
    }
  } catch (error) {
    logger.warn('Falha ao resolver versão WA Web; usando fallback', { error });
  }
  return fallbackWaWebVersion();
}

/** Executa uma promise com timeout; rejeita com mensagem clara se exceder. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export interface WhatsAppEvents {
  'status': (status: WhatsAppStatus) => void;
  'message': (message: IncomingMessage) => void;
  'qr': (qr: string) => void;
}

/**
 * Gerenciador de conexão por empresa (multi-tenant). Cada empresa possui uma
 * sessão Baileys própria (diretório = sessionPath/<businessId>), de modo que
 * o WhatsApp de cada negócio seja independente.
 */
export class WhatsAppConnection extends EventEmitter {
  readonly businessId: string;
  private socket: any = null;
  private baileys: any = null;
  private state: WhatsAppConnectionState = 'idle';
  private lastError: string | null = null;
  private qr: string | null = null;
  private qrDataUrl: string | null = null;
  private connectedPhone: string | null = null;
  private reconnectAttempts = 0;
  private connecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageHandler: MessageReceivedHandler | null = null;
  private getMessageCb: ((key: any) => Promise<any>) | null = null;

  constructor(businessId?: string) {
    super();
    this.businessId = businessId ?? DEFAULT_BUSINESS_SESSION;
  }

  /** Registra o callback getMessage usado pelo Baileys em retry/prekey
   *  (resolve "this message can take a while"/"aguardando mensagem"). */
  setGetMessage(cb: (key: any) => Promise<any>): void {
    this.getMessageCb = cb;
  }

  getStatus(): WhatsAppStatus {
    return {
      connected: this.state === 'connected',
      state: this.state,
      lastError: this.lastError,
      qrAvailable: this.qr !== null,
      qr: this.qr,
      qrDataUrl: this.qrDataUrl,
      loggedIn: Boolean(this.connectedPhone) || this.state === 'connected',
      phone: this.connectedPhone,
    };
  }

  setMessageHandler(handler: MessageReceivedHandler): void {
    this.messageHandler = handler;
  }

  async connect(): Promise<WhatsAppStatus> {
    if (this.connecting) {
      logger.info('WhatsApp: conexão já em andamento');
      return this.getStatus();
    }
    this.connecting = true;
    this.cancelReconnect();
    try {
      this.setStatus('connecting');
      if (!this.baileys) {
        this.baileys = await this.loadBaileys();
      }
      // Encerra qualquer conexão anterior (reconexão manual limpa timers/socket)
      await this.teardownSocket();
      await this.startSocket();
      return this.getStatus();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.setStatus('error');
      logger.error('Falha ao conectar ao WhatsApp', { error });
      return this.getStatus();
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<WhatsAppStatus> {
    this.cancelReconnect();
    await this.teardownSocket();
    this.setStatus('closed');
    return this.getStatus();
  }

  /**
   * Desconecta e apaga TODOS os arquivos de sessão (força novo pareamento via QR).
   * Destrutivo: o aparelho atualmente pareado será deslogado do WhatsApp.
   */
  async clearSession(): Promise<WhatsAppStatus> {
    this.cancelReconnect();
    await this.teardownSocket();
    this.qr = null;
    this.qrDataUrl = null;
    this.connectedPhone = null;
    this.lastError = null;
    await clearSessionFiles(this.businessId);
    this.setStatus('idle');
    logger.warn('Sessão WhatsApp limpa via painel', { business_id: this.businessId });
    return this.getStatus();
  }

  /**
   * Envia mensagem. Prioriza o JID do TELEFONE (entrega garantida) e usa o
   * remoteJid apenas como fallback (LIDs podem ser aceitos mas não entregues).
   */
  async sendText(phoneE164: string, text: string, remoteJid?: string): Promise<string | null> {
    if (!this.socket || this.state !== 'connected') {
      throw new Error('WhatsApp não conectado');
    }
    const jid = (phoneE164 && this.toJid(phoneE164)) || remoteJid;
    if (!jid) {
      throw new Error('Sem destinatário para enviar mensagem');
    }
    const result = (await withTimeout(
      this.socket.sendMessage(jid, { text }) as Promise<any>,
      SEND_TIMEOUT_MS,
      `Timeout ao enviar mensagem para ${jid}`
    )) as { key?: { id?: string } | null } | undefined;
    const id = result?.key?.id ?? null;
    logger.info('Mensagem WhatsApp enviada', { to: jid, id, chars: text.length });
    return id;
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.socket !== null;
  }

  /**
   * Resolve um JID LID (@lid) para o número de telefone real usando o mapa
   * LID→PN mantido pelo Baileys v7. Retorna os dígitos (ex.: 5511978197645)
   * ou null se não for um LID / não resolvível.
   */
  async resolvePhoneFromLid(lidJid: string): Promise<string | null> {
    if (!lidJid?.includes('@lid')) return null;
    try {
      const pn = await this.socket?.signalRepository?.lidMapping?.getPNForLID(lidJid);
      if (pn) {
        const digits = String(pn).split('@')[0].split(':')[0];
        if (digits) return digits;
      }
    } catch (error) {
      logger.warn('Falha ao resolver LID→telefone', { lid_jid: lidJid, error });
    }
    return null;
  }

  async isRegistered(phoneE164: string): Promise<boolean> {
    if (!this.socket) return false;
    try {
      const jid = this.toJid(phoneE164);
      const [result] = await this.socket.onWhatsApp(jid);
      return Boolean(result?.exists);
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------

  private async loadBaileys(): Promise<any> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@whiskeysockets/baileys');
      return mod;
    } catch (error) {
      logger.error('Baileys não instalado. Rode `npm install -w @prospector/whatsapp`.', { error });
      throw new Error('Baileys não disponível: `npm install -w @prospector/whatsapp`');
    }
  }

  private async teardownSocket(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.ev?.removeAllListeners('connection.update');
        this.socket.ev?.removeAllListeners('creds.update');
        this.socket.ev?.removeAllListeners('messages.upsert');
        this.socket.ev?.removeAllListeners('contacts.update');
      } catch {
        /* noop */
      }
      try {
        this.socket.ws?.close();
      } catch {
        /* noop */
      }
      try {
        this.socket.end(undefined as never);
      } catch {
        /* noop */
      }
      this.socket = null;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(delayMs: number): void {
    this.cancelReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.connecting) return;
      this.startSocket().catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.setStatus('error');
      });
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  private async startSocket(): Promise<void> {
    if (this.connecting && this.socket) {
      logger.debug('startSocket: já existe socket; ignorando chamada duplicada');
      return;
    }
    const { default: makeWASocket, DisconnectReason, makeCacheableSignalKeyStore } = this.baileys;
    const { state, saveCreds } = await loadSessionAuth(this.baileys, this.businessId);

    const loggerPino = createSilentLogger();
    const keys = makeCacheableSignalKeyStore(state.keys, loggerPino);
    const waVersion = await getWaWebVersion();

    this.socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys,
      },
      version: waVersion,
      printQRInTerminal: false,
      browser: ['SAVYRON', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      fireInitQueries: true,
      connectTimeoutMs: BAISLEYS_TIMEOUT_MS,
      keepAliveIntervalMs: KEEP_ALIVE_MS,
      generateHighQualityLinkPreview: false,
      emitOwnEvents: true,
      shouldSyncHistoryMessage: () => false,
      // getMessage: usado no fluxo de retry/prekey; sem ele, mensagens podem
      // ficar presas em "aguardando mensagem" (issue #1701 do Baileys)
      getMessage: this.getMessageCb ?? (async () => undefined),
      // cache de contador de retry em memória (evita reiniciar contadores)
      msgRetryCounterCache: new Map(),
      // Logger pino real em nível 'silent'
      logger: loggerPino,
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update ?? {};

      if (qr) {
        this.qr = qr;
        this.qrDataUrl = null;
        this.setStatus('waiting_for_qr');
        this.emit('qr', qr);
        void this.renderQrDataUrl(qr);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          this.setStatus('logged_out');
          logger.warn('WhatsApp: sessão encerrada/logged out. Será necessário novo QR.');
          return;
        }
        this.setStatus('closed');
        // Descarta o socket fechado e agenda UMA reconexão com backoff
        this.socket = null;
        this.reconnectAttempts += 1;
        if (this.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
          logger.info(`WhatsApp: reconectando em ${delay}ms (tentativa ${this.reconnectAttempts})`);
          this.scheduleReconnect(delay);
        } else {
          logger.error('WhatsApp: falha na reconexão após várias tentativas');
          this.reconnectAttempts = 0;
          this.setStatus('error');
        }
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.connectedPhone = this.socket?.user?.id?.split(':')[0] ?? null;
        this.setStatus('connected');
        logger.info('WhatsApp conectado', { phone: this.connectedPhone });
      }

      if (isNewLogin) {
        logger.info('WhatsApp: novo login detectado');
      }
    });

    this.socket.ev.on('messages.upsert', (upsert: any) => {
      void this.handleMessagesUpsert(upsert);
    });

    // ACKs de envio: status 1=PENDING 2=SERVER_ACK 3=DELIVERY_ACK 4=READ
    this.socket.ev.on('messages.update', (updates: any[]) => {
      for (const update of updates ?? []) {
        if (update && typeof update.id === 'string' && update.status !== undefined) {
          this.emit('ack', { id: update.id, status: update.status });
        }
      }
    });

    this.socket.ev.on('contacts.update', () => {
      /* noop */
    });
  }

  private async handleMessagesUpsert(upsert: any): Promise<void> {
    try {
      const { messages } = upsert ?? {};
      if (!messages || !Array.isArray(messages)) return;

      for (const msg of messages) {
        if (!msg) continue;
        const rawJid = msg?.key?.remoteJid;
        const msgType = msg?.message ? Object.keys(msg.message)[0] : 'none';
        logger.info('WA messages.upsert (estrutura)', {
          type: upsert?.type,
          id: String(msg?.key?.id ?? ''),
          remoteJid: String(rawJid ?? ''),
          remoteJidAlt: String(msg?.key?.remoteJidAlt ?? ''),
          fromMe: Boolean(msg?.key?.fromMe),
          addressingMode: String(msg?.addressingMode ?? ''),
          participant: String(msg?.key?.participant ?? ''),
          pushName: String(msg?.pushName ?? ''),
          msgType,
          stubType: msg?.messageStubType ?? null,
          messageTimestamp: Number(msg?.messageTimestamp ?? 0),
        });
        const parsed = this.parseIncoming(msg);
        if (!parsed) continue;
        if (this.messageHandler) {
          await this.messageHandler(parsed);
        } else {
          logger.debug('Mensagem recebida sem handler registrado', {
            from: parsed.fromPhone,
          });
        }
      }
    } catch (error) {
      logger.error('Erro ao processar mensagem recebida do WhatsApp', { error });
    }
  }

  private parseIncoming(msg: any): IncomingMessage | null {
    const key = msg.key;
    const messageContent = msg.message;

    if (!key || !messageContent) return null;
    if (key.fromMe) return null;
    if (key.remoteJid?.includes('@g.us') || key.remoteJid?.includes('@broadcast')) return null;

    let text: string | null = null;
    if (typeof messageContent.conversation === 'string') text = messageContent.conversation;
    else if (messageContent.extendedTextMessage?.text) text = messageContent.extendedTextMessage.text;
    else if (messageContent.imageMessage?.caption) text = messageContent.imageMessage.caption;
    else if (messageContent.ephemeralMessage?.message) {
      const inner = messageContent.ephemeralMessage.message;
      if (typeof inner.conversation === 'string') text = inner.conversation;
      else if (inner.extendedTextMessage?.text) text = inner.extendedTextMessage.text;
    }

    if (text === null) return null;

    // Normaliza o JID (cobre @lid, @s.whatsapp.net, sufixos de device/agent)
    const { jidNormalizedUser, jidDecode, jidEncode } = this.baileys;
    const rawJid = String(key.remoteJid ?? '');
    let remoteJid = jidNormalizedUser(rawJid);
    if (!remoteJid) {
      const decoded = jidDecode(rawJid);
      if (decoded) {
        remoteJid = jidEncode(decoded.user, decoded.server, decoded.device, undefined);
      } else {
        remoteJid = rawJid;
      }
    }

    const phone = String(remoteJid).split('@')[0];
    if (!phone) return null;

    return {
      fromPhone: phone,
      remoteJid,
      content: text.trim(),
      messageId: key.id ?? null,
      timestamp: Number(msg.messageTimestamp ?? Date.now()),
      raw: msg,
    };
  }

  private async renderQrDataUrl(qr: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const qrcode = require('qrcode');
      const dataUrl = await qrcode.toDataURL(qr, { width: 320, margin: 1 });
      this.qrDataUrl = dataUrl;
      this.emit('status', this.getStatus());
    } catch (error) {
      logger.warn('Falha ao gerar QR image', { error });
    }
  }

  private toJid(phoneE164: string): string {
    const digits = phoneE164.replace(/\D/g, '');
    return `${digits}@s.whatsapp.net`;
  }

  private setStatus(state: WhatsAppConnectionState): void {
    this.state = state;
    if (state !== 'error') {
      this.lastError = null;
    }
    this.emit('status', this.getStatus());
  }

  // Logger pino real, mudo (evita os crashes de loggers custom incompletos do Baileys)
  private silentLogger(): any {
    return createSilentLogger();
  }
}

/**
 * Registro de conexões WhatsApp por empresa. Mantém um WhatsAppConnection por
 * businessId, criando sob demanda. `whatsappManager` é o gerente da empresa
 * padrão (backward-compat); usuários novos deveriam usar `getWhatsAppManager()`.
 */
class WhatsAppManagerRegistry extends EventEmitter {
  private connections = new Map<string, WhatsAppConnection>();

  private key(businessId?: string): string {
    return isLegacySession(businessId) ? DEFAULT_BUSINESS_SESSION : (businessId as string);
  }

  /** Retorna (criando se necessário) a conexão de uma empresa. */
  get(businessId?: string): WhatsAppConnection {
    const k = this.key(businessId);
    let conn = this.connections.get(k);
    if (!conn) {
      conn = new WhatsAppConnection(isLegacySession(businessId) ? undefined : businessId);
      this.applyHandlers(conn, k);
      this.connections.set(k, conn);
    }
    return conn;
  }

  list(): WhatsAppConnection[] {
    return [...this.connections.values()];
  }

  remove(businessId?: string): void {
    const k = this.key(businessId);
    this.connections.delete(k);
  }

  private applyHandlers(conn: WhatsAppConnection, key: string): void {
    conn.on('status', (status) => this.emit('status', key, status));
    conn.on('message', (message) => this.emit('message', key, message));
    conn.on('qr', (qr) => this.emit('qr', key, qr));
  }
}

/**
 * `whatsappManager` preserva a API antiga para a empresa padrão, mas agora é
 * apenas a conexão da empresa `default`. Rotas/workers multi-tenant devem usar
 * `whatsappRegistry`.
 */
export const whatsappManager = new WhatsAppConnection();
export const whatsappRegistry = new WhatsAppManagerRegistry();
export function getWhatsAppManager(businessId?: string): WhatsAppConnection {
  return whatsappRegistry.get(businessId);
}
