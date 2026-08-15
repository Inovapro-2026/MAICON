import { createLogger } from "@prospector/logger";
import { redis } from "./redis";

const logger = createLogger("worker.realtime");

/** Canal Redis onde a API escuta para retransmitir via Socket.IO. */
export const REALTIME_REDIS_CHANNEL = "realtime:events";

export type RealtimeEventType =
  | "new_message_received"
  | "ai_response_generated"
  | "status_changed"
  | "prospecting_progress";

/** Progresso de uma run de prospecção (espelha ProspectionProgress + meta). */
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
  /** Identifica a run de prospecção quando type === 'prospecting_progress'. */
  prospectingRunId?: string;
  progress?: ProspectingProgressEvent;
  payload?: {
    content?: string;
    direction?: "IN" | "OUT";
    lead_status?: string;
    human_handled?: boolean;
  };
}

/** Monta um evento de progresso de prospecção para o canal realtime. */
export function buildProspectingEvent(params: {
  businessId: string;
  prospectingRunId: string;
  progress: ProspectingProgressEvent;
}): RealtimeEventMessage {
  return {
    type: "prospecting_progress",
    businessId: params.businessId,
    prospectingRunId: params.prospectingRunId,
    progress: params.progress,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Publica um evento em tempo real no Redis (pub/sub).
 * A API consome o canal e retransmite para os navegadores via Socket.IO.
 * Falhas aqui nunca devem derrubar o processamento do job.
 */
export function publishRealtime(event: RealtimeEventMessage): void {
  try {
    redis
      .publish(REALTIME_REDIS_CHANNEL, JSON.stringify(event))
      .catch((error: unknown) =>
        logger.debug("Falha ao publicar evento realtime", {
          error: String(error),
          event,
        }),
      );
  } catch (error) {
    logger.debug("Falha ao publicar evento realtime", { error: String(error) });
  }
}
