/**
 * CONVERSATION LEARNING ENGINE — tipos de domínio (SAVYRON).
 *
 * Inteligência comercial POR TENANT: toda entidade de aprendizado carrega
 * `business_id`/`tenantId` explicitamente. Nenhuma função global consulta dados
 * de vários tenants — Tenant A nunca aprende nem acessa o Tenant B.
 */
import {
  CommercialStageValue,
  CommercialTechnique,
  NextAction,
} from "../commercial-engine";

/** Fatos que o agente pode descobrir sobre o lead (lacunas de informação). */
export type MissingFact =
  | "name"
  | "segment"
  | "acquisition_channel"
  | "need"
  | "pain"
  | "objective"
  | "budget"
  | "objection"
  | "tools";

export const MISSING_FACTS: readonly MissingFact[] = [
  "name",
  "segment",
  "acquisition_channel",
  "need",
  "pain",
  "objective",
  "budget",
  "objection",
  "tools",
];

/** Ação de pergunta correspondente a cada fato (mapeamento para o Decision Engine). */
export const ASK_ACTION_BY_FACT: Record<MissingFact, NextAction> = {
  name: "ASK_NAME",
  segment: "ASK_BUSINESS_TYPE",
  acquisition_channel: "ASK_CURRENT_ACQUISITION",
  need: "UNDERSTAND_PAIN",
  pain: "UNDERSTAND_PAIN",
  objective: "UNDERSTAND_PAIN",
  budget: "ASK_CURRENT_PROCESS",
  objection: "HANDLE_OBJECTION",
  tools: "ASK_CURRENT_PROCESS",
};

/** Pergunta feita pelo agente e o desfecho observado. */
export interface LearningQuestionEvent {
  text: string;
  /** Próxima ação de descoberta tomada pelo agente (Decision/Strategy Engine). */
  next_action: NextAction | null;
  /** Tamanho da resposta do cliente (0 = sem resposta). */
  response_length: number;
  /** Cliente respondeu de forma substantiva (continuidade). */
  continuity: boolean;
  /** A conversa foi encerrada logo após esta pergunta (abandono). */
  followed_by_close: boolean;
  /** Sinal de interesse comercial na sequência. */
  interest_signal: boolean;
}

/** Resultado comercial de uma conversa analisada. */
export type InsightOutcomeValue = "CONVERTED" | "ABANDONED" | "LOST" | "ONGOING";

/** Análise completa de uma conversa para aprendizado. */
export interface LearningAnalysis {
  tenantId: string;
  conversationId: string;
  leadId: string;
  segment: string | null;
  acquisitionChannel: string | null;
  stageAtClose: CommercialStageValue | null;
  outcome: InsightOutcomeValue;
  messageCount: number;
  agentQuestionCount: number;
  customerMessageCount: number;
  messagesToPrice: number | null;
  messagesToConversion: number | null;
  lastAgentQuestion: string | null;
  lastCustomerMessage: string | null;
  pains: string[];
  objections: string[];
  needs: string[];
  questions: LearningQuestionEvent[];
  techniques: CommercialTechnique[];
  strategyUsed: string | null;
}

/**
 * "Assinatura" de uma decisão comercial: perfil (segmento/canal) + fato que
 * faltava descobrir. É a chave de agregação das estratégias aprendidas.
 */
export interface DecisionSignature {
  segment: string | null;
  acquisitionChannel: string | null;
  missingFact: MissingFact;
}

/** Resultado agregado de uma decisão (célula de aprendizado). */
export interface DecisionAggregate {
  tenantId: string;
  signature: DecisionSignature;
  /** Próxima ação tomada (ex.: UNDERSTAND_PAIN vs EXPLAIN_RELEVANT_SOLUTION). */
  action: NextAction;
  sampleCount: number;
  continuityCount: number;
  interestCount: number;
  conversionCount: number;
  abandonCount: number;
  continuityRate: number;
  interestRate: number;
  conversionRate: number;
  successRate: number;
  confidence: number;
}

/** Status de uma estratégia aprendida (espelha StrategyStatus do banco). */
export type StrategyStatusValue = "LEARNING" | "ACTIVE" | "DISCARDED";

/** Estratégia pronta para uso no runtime (carregada por tenant). */
export interface RuntimeStrategy {
  id: string;
  tenantId: string;
  strategyId: string;
  version: number;
  name: string;
  description: string | null;
  segment: string | null;
  acquisitionChannel: string | null;
  missingFact: MissingFact | null;
  recommendedNextAction: NextAction;
  sampleCount: number;
  confidence: number;
  successRate: number;
  continuityRate: number;
  responseRate: number;
  interestRate: number;
  conversionRate: number;
  status: StrategyStatusValue;
}

/** Recomendação do Strategy Engine para o Decision Engine. */
export interface StrategyRecommendation {
  strategyId: string;
  strategyVersion: number;
  tenantId: string;
  name: string;
  reason: string;
  missingFact: MissingFact;
  nextAction: NextAction;
  confidence: number;
  sampleCount: number;
  continuityRate: number;
}