'use client';

import { io, Socket } from 'socket.io-client';
import { SOCKET_OPTIONS, RealtimeEventMessage, RealtimeEventType } from '@/lib/realtime';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Cliente Socket.IO singleton (módulo-level).
 * Garante UMA única conexão enquanto o app estiver aberto, independente da
 * navegação entre rotas — evita múltiplas conexões/vazamento de memória.
 */
class RealtimeClient {
  private socket: Socket | null = null;
  private tokenPromise: Promise<string | null> | null = null;
  private handlers = new Map<string, Set<(event: RealtimeEventMessage) => void>>();
  private statusListeners = new Set<(status: RealtimeStatus) => void>();
  status: RealtimeStatus = 'disconnected';

  private fetchToken(): Promise<string | null> {
    this.tokenPromise ??= fetch('/api/auth/socket-token', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = (await res.json()) as { success?: boolean; token?: string };
        return json.success ? (json.token ?? null) : null;
      })
      .catch(() => null);
    return this.tokenPromise;
  }

  getSocket(): Socket {
    if (this.socket) return this.socket;

    const socket = io(SOCKET_OPTIONS.url || undefined, {
      path: SOCKET_OPTIONS.path,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      autoConnect: false,
      auth: (cb) => {
        void this.fetchToken().then((token) => cb({ token: token ?? '' }));
      },
    });

    socket.on('connect', () => {
      this.status = 'connected';
      this.emitStatus();
    });
    socket.on('connect_error', (error) => {
      if (error.message === 'UNAUTHORIZED') this.tokenPromise = null;
      this.status = 'connecting';
      this.emitStatus();
    });
    socket.on('disconnect', (reason) => {
      this.status = reason === 'io client disconnect' ? 'disconnected' : 'connecting';
      this.emitStatus();
    });

    this.socket = socket;
    socket.connect();
    return socket;
  }

  /** Inscreve um listener para determinado tipo de evento. Retorna cleanup. */
  on(type: RealtimeEventType, handler: (event: RealtimeEventMessage) => void): () => void {
    const socket = this.getSocket();
    if (!this.handlers.has(type)) {
      const set = new Set<(event: RealtimeEventMessage) => void>();
      this.handlers.set(type, set);
      socket.on(type, (event: RealtimeEventMessage) => {
        for (const h of new Set(set)) h(event);
      });
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Escuta mudanças de estado da conexão. Retorna cleanup. */
  onStatus(listener: (status: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private emitStatus(): void {
    for (const l of new Set(this.statusListeners)) l(this.status);
  }
}

// '' = mesmo origin (nginx faz proxy /socket.io -> API). Em dev, configure
// NEXT_PUBLIC_SOCKET_URL=http://localhost:4005.
const SOCKET_URL = SOCKET_OPTIONS.url || '';

export const realtimeClient = new RealtimeClient();