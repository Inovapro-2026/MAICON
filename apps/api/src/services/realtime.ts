import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createLogger } from "@prospector/logger";
import { config } from "@prospector/config";
import { redisClient } from "./redis";
import { verifyToken, TokenPayload } from "./jwt";

const logger = createLogger("api.realtime");

/** Canal Redis de onde a API consome eventos publicados pelo worker. */
const REALTIME_REDIS_CHANNEL = "realtime:events";

export type RealtimeEventType =
  | "new_message_received"
  | "ai_response_generated"
  | "status_changed"
  | "prospecting_progress";

export interface ProspectingProgressEvent {
  searched?: number;
  found?: number;
  crawled?: number;
  extracted?: number;
  duplicates?: number;
  qualified?: number;
  saved?: number;
  errors?: number;
  targetQuantity?: number;
}

export interface RealtimeEventMessage {
  type: RealtimeEventType;
  conversationId?: string;
  leadId?: string;
  timestamp: string;
  businessId?: string;
  prospectingRunId?: string;
  progress?: ProspectingProgressEvent;
  payload?: {
    content?: string;
    direction?: "IN" | "OUT";
    lead_status?: string;
    human_handled?: boolean;
    notification?: Record<string, unknown>;
  };
}


class RealtimeService {
  private io: SocketIOServer | null = null;
  private subscriber: ReturnType<typeof redisClient.duplicate> | null = null;

  /**
   * Anexa o Socket.IO ao servidor HTTP existente e passa a escutar
   * eventos publicados no Redis pelos workers.
   */
  init(server: HTTPServer): SocketIOServer {
    if (this.io) return this.io;

    this.io = new SocketIOServer(server, {
      cors: {
        origin: [config.app.dashboardUrl, config.app.url, /\.inovapro\.cloud$/],
        credentials: true,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
      pingTimeout: 30000,
      pingInterval: 25000,
    });

    this.io.use((socket, next) => {
      const authToken =
        (socket.handshake.auth?.token as string | undefined) ?? "";
      const cookieToken = parseCookieToken(
        String(socket.handshake.headers.cookie ?? ""),
      );
      const token = authToken || cookieToken;
      if (!token) return next(new Error("UNAUTHORIZED"));

      verifyToken(token)
        .then((payload) => {
          if (!payload) {
            return next(new Error("UNAUTHORIZED"));
          }
          // Socket.TypeScript augmentation — armazena o usuário no socket
          (socket as SocketWithUser).data.user = payload;
          return next();
        })
        .catch((error: unknown) => {
          logger.debug("Falha na autenticação do socket", {
            error: String(error),
          });
          return next(new Error("UNAUTHORIZED"));
        });
    });

    this.io.on("connection", (socket) => {
      logger.info("Cliente realtime conectado", { socket_id: socket.id });
      const businessId = (socket as SocketWithUser).data.user?.businessId;
      if (businessId) {
        void socket.join(businessId);
        logger.debug("Cliente realtime entrou na sala da empresa", {
          socket_id: socket.id,
          business_id: businessId,
        });
      }
      socket.on("disconnect", (reason) => {
        logger.debug("Cliente realtime desconectado", {
          socket_id: socket.id,
          reason,
        });
      });
    });

    // Consome eventos do worker via Redis pub/sub
    this.subscriber = redisClient.duplicate();
    this.subscriber.on("error", (error) => {
      logger.error("Erro no subscriber Redis (realtime)", {
        error: String(error.message),
      });
    });
    this.subscriber.subscribe(REALTIME_REDIS_CHANNEL as never, (err) => {
      if (err) {
        logger.error("Falha ao assinar canal de eventos", {
          error: String(err),
        });
        return;
      }
      logger.info("Assinado canal realtime", {
        redis_channel: REALTIME_REDIS_CHANNEL,
      });
    });
    this.subscriber.on("message", (_channel, raw) => {
      try {
        const event = JSON.parse(raw) as RealtimeEventMessage;
        this.broadcast(event);
      } catch (error) {
        logger.debug("Evento realtime ignorado (JSON inválido)", {
          error: String(error),
        });
      }
    });

    logger.info("Socket.IO realtime inicializado");
    return this.io;
  }

  /** Retransmite um evento. Se tiver businessId, entrega apenas à sala da empresa. */
  broadcast(event: RealtimeEventMessage): void {
    if (!this.io) return;
    if (event.businessId) {
      this.io.to(event.businessId).emit(event.type, event);
    } else {
      this.io.emit(event.type, event);
    }
  }

  /** Evento gerado dentro da própria API (rotas). */
  emit(event: RealtimeEventMessage): void {
    this.broadcast(event);
  }

  /** Quantidade atual de clientes conectados. */
  clientCount(): number {
    if (!this.io) return 0;
    return this.io.engine.clientsCount;
  }

  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe().catch(() => undefined);
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    if (this.io) {
      await new Promise<void>((resolve) => this.io?.close(() => resolve()));
      this.io = null;
    }
  }
}

interface SocketWithUser {
  data: { user?: TokenPayload };
}

function parseCookieToken(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)acp_token=([^;]+)/);
  return match ? decodeURIComponent(match[1].trim()) : "";
}

export const realtimeService = new RealtimeService();

/** Monta um evento retransmissível a partir de dados parciais. */
export function buildEvent(
  type: RealtimeEventType,
  conversationId: string,
  leadId: string,
  payload: RealtimeEventMessage["payload"] = {},
  businessId?: string,
): RealtimeEventMessage {
  return {
    type,
    conversationId,
    leadId,
    timestamp: new Date().toISOString(),
    payload,
    ...(businessId ? { businessId } : {}),
  };
}
