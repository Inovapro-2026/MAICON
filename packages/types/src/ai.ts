export interface AIGeneration {
  id: string;
  lead_id: string;
  conversation_id: string | null;
  provider: string;
  model: string;
  prompt_version: string;
  prompt: string | null;
  completion: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  error: string | null;
  created_at: string;
}

export type AIProviderName = 'groq';

export interface AICompletionResult {
  text: string;
  provider: AIProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/** Contexto passado ao agente para gerar a resposta. */
export interface AgentContext {
  leadName: string | null;
  businessName: string | null;
  city: string | null;
  state: string | null;
  /** Mensagens recentes da conversa, da mais antiga para a mais nova. */
  history: { role: 'assistant' | 'user'; content: string }[];
  /** Metadados de classificação já detectados (opcional). */
  intent?: string | null;
  /**
   * Perfil do contato, derivado de dados reais (status do lead e histórico) —
   * determina o modo da IA:
   * 'novo' = lead em prospecção (postura de venda consultiva);
   * 'conhecido' = já interagiu/recebeu link/é cliente (postura de suporte).
   */
  contactType?: 'novo' | 'conhecido';
  /**
   * Estágio comercial atual da conversa (Motor Comercial):
   * NEW | QUALIFYING | DISCOVERY | EVALUATION | NEGOTIATION | CLOSED_WON | CLOSED_LOST.
   * A IA usa para avançar dinamicamente pelo funil — não é um roteiro fixo.
   */
  conversationStage?: string | null;
}

/** Resultado da classificação da resposta do lead. */
export interface IntentClassification {
  intent:
    | 'INTERESTED'
    | 'NOT_INTERESTED'
    | 'OPT_OUT'
    | 'RESPONDED'
    | 'QUESTION'
    | 'BUSY'
    | 'UNKNOWN';
  needsRegistrationLink: boolean;
  confidence: number;
  summary: string;
}
