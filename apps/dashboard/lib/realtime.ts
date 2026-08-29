/** Tipos compartilhados dos eventos em tempo real (WS via Socket.IO). */

export type RealtimeEventType =
  | "new_message_received"
  | "ai_response_generated"
  | "status_changed"
  | "prospecting_progress"
  | "whatsapp_group_progress";

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
  /** Extração de grupos do WhatsApp: únicos, com telefone, enriquecidos. */
  unique?: number;
  phone?: number;
  enriched?: number;
}

export interface RealtimeEventMessage {
  type: RealtimeEventType;
  conversationId?: string;
  leadId?: string;
  timestamp: string;
  businessId?: string;
  prospectingRunId?: string;
  /** Identifica a extração de grupo quando type === 'whatsapp_group_progress'. */
  extractionId?: string;
  /** Erro quando type === 'whatsapp_group_progress' e a extração falhou. */
  error?: string;
  progress?: ProspectingProgressEvent;
  payload?: {
    content?: string;
    direction?: "IN" | "OUT";
    lead_status?: string;
    human_handled?: boolean;
    notification?: Record<string, unknown>;
  };
}


/** URL base do Socket.IO — definida via env no build/produção. */
export const SOCKET_OPTIONS = {
  // Em produção usa o mesmo origin (nginx faz proxy /socket.io -> API).
  // Em dev, defina NEXT_PUBLIC_SOCKET_URL=http://localhost:4005.
  url: process.env.NEXT_PUBLIC_SOCKET_URL || "",
  path: "/socket.io",
} as const;
