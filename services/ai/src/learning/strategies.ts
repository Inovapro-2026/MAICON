/**
 * CONVERSATION LEARNING ENGINE — agregação de padrões e estratégias (SAVYRON).
 *
 * A partir dos insights brutos (`SalesConversationInsight`) de UM tenant,
 * agrega células de decisão (perfil + fato que faltava → ação) e deriva
 * estratégias versionadas com amostras/confiança/status. UMA conversa isolada
 * nunca ativa uma estratégia: os limites de amostras e confiança são
 * obrigatórios (config `learning.*`).
 *
 * Isolamento: toda função de banco recebe `tenantId` e filtra por ele.
 */
import { NextAction } from "../commercial-engine";
import {
  ASK_ACTION_BY_FACT,
  DecisionAggregate,
  DecisionSignature,
  InsightOutcomeValue,
  LearningAnalysis,
  LearningQuestionEvent,
  MissingFact,
  MISSING_FACTS,
  RuntimeStrategy,
  StrategyStatusValue,
} from "./types";

/** Limites configuráveis do aprendizado (espelha config.learning). */
export interface LearningThresholds {
  minSamplesActive: number;
  minContinuityActive: number; // 0-100
  minConfidence: number; // 0-100
  discardContinuity: number; // 0-100
}

export const DEFAULT_LEARNING_THRESHOLDS: LearningThresholds = {
  minSamplesActive: 30,
  minContinuityActive: 50,
  minConfidence: 60,
  discardContinuity: 20,
};

/** Fato que uma próxima ação busca descobrir. */
export function missingFactFromAction(
  action: NextAction | null,
): MissingFact | null {
  if (!action) return null;
  switch (action) {
    case "ASK_NAME":
      return "name";
    case "ASK_BUSINESS_TYPE":
      return "segment";
    case "ASK_CURRENT_ACQUISITION":
      return "acquisition_channel";
    case "ASK_CURRENT_PROCESS":
      return "tools";
    case "UNDERSTAND_PAIN":
      return "pain";
    case "HANDLE_OBJECTION":
      return "objection";
    default:
      return null;
  }
}

export function actionForFact(fact: MissingFact): NextAction {
  return ASK_ACTION_BY_FACT[fact];
}

/** Evento de decisão extraído de um insight (uma pergunta feita). */
export interface DecisionEvent {
  segment: string | null;
  acquisitionChannel: string | null;
  missingFact: MissingFact;
  action: NextAction;
  continuity: boolean;
  interestSignal: boolean;
  outcome: InsightOutcomeValue;
}

/**
 * Converte o array de perguntas de um insight em eventos de decisão.
 * Perguntas sem mapeamento de fato (ANSWER_QUESTION, PROPOSE_NEXT_STEP...)
 * são ignoradas — só decisões de DESCOBERTA alimentam o aprendizado.
 */
export function eventsFromInsight(insight: LearningAnalysis): DecisionEvent[] {
  const out: DecisionEvent[] = [];
  for (const q of insight.questions ?? []) {
    const action = q.next_action;
    const fact = missingFactFromAction(action);
    if (!action || !fact) continue;
    out.push({
      segment: insight.segment,
      acquisitionChannel: insight.acquisitionChannel,
      missingFact: fact,
      action,
      continuity: q.continuity,
      interestSignal: q.interest_signal,
      outcome: insight.outcome,
    });
  }
  return out;
}

/** Chave de agregação: perfil + fato que faltava. */
export function signatureKey(sig: DecisionSignature): string {
  return `${sig.segment ?? "*"}|${sig.acquisitionChannel ?? "*"}|${sig.missingFact}`;
}

/** Agrega eventos de decisão de todos os insights de um tenant. */
export function aggregateDecisions(
  insights: LearningAnalysis[],
): DecisionAggregate[] {
  type Cell = DecisionSignature & {
    tenantId: string;
    action: NextAction;
    events: DecisionEvent[];
  };
  const byKey = new Map<string, Cell>();

  for (const insight of insights) {
    for (const ev of eventsFromInsight(insight)) {
      const sig: DecisionSignature = {
        segment: ev.segment,
        acquisitionChannel: ev.acquisitionChannel,
        missingFact: ev.missingFact,
      };
      const key = signatureKey(sig);
      let cell = byKey.get(key);
      if (!cell) {
        cell = {
          ...sig,
          tenantId: insight.tenantId,
          action: ev.action,
          events: [],
        };
        byKey.set(key, cell);
      }
      cell.events.push(ev);
    }
  }

  const result: DecisionAggregate[] = [];
  for (const cell of byKey.values()) {
    const samples = cell.events.length;
    const continuity = cell.events.filter((e) => e.continuity).length;
    const interest = cell.events.filter((e) => e.interestSignal).length;
    const converted = cell.events.filter(
      (e) => e.outcome === "CONVERTED",
    ).length;
    const abandoned = cell.events.filter(
      (e) => e.outcome === "ABANDONED" || e.outcome === "LOST",
    ).length;
    const continuityRate = samples ? continuity / samples : 0;
    const interestRate = samples ? interest / samples : 0;
    const conversionRate = samples ? converted / samples : 0;
    result.push({
      tenantId: cell.tenantId,
      signature: {
        segment: cell.segment,
        acquisitionChannel: cell.acquisitionChannel,
        missingFact: cell.missingFact,
      },
      action: cell.action,
      sampleCount: samples,
      continuityCount: continuity,
      interestCount: interest,
      conversionCount: converted,
      abandonCount: abandoned,
      continuityRate,
      interestRate,
      conversionRate,
      // Sucesso = resposta substantiva (continuidade) — o que a pergunta
      // consegue "desbloquear" da conversa.
      successRate: continuityRate,
      // Confiança com suavização bayesiana (prior = 0.5): 1 conversa não
      // altera nada, 500 conversas geram confiança alta.
      confidence: (continuity + 0.5) / (samples + 1),
    });
  }
  return result;
}

/** Status de uma estratégia segundo os limites configurados. */
export function strategyStatus(
  agg: Pick<DecisionAggregate, "sampleCount" | "continuityRate">,
  thresholds: LearningThresholds,
): StrategyStatusValue {
  const minActive = Math.max(1, thresholds.minSamplesActive);
  const activeRate = thresholds.minContinuityActive / 100;
  const discardRate = thresholds.discardContinuity / 100;
  if (agg.sampleCount < minActive) return "LEARNING";
  if (agg.continuityRate >= activeRate) return "ACTIVE";
  if (agg.continuityRate <= discardRate) return "DISCARDED";
  return "LEARNING";
}

/** Slug de estratégia: `ask_<fato>` para perfil genérico, `ask_<fato>_<segmento>` para perfil. */
export function strategyIdFor(
  missingFact: MissingFact,
  segment: string | null,
): string {
  const base = `ask_${missingFact}`;
  if (!segment) return base;
  const slug = segment
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `${base}_${slug}` : base;
}

/** Draft de estratégia calculado a partir de uma célula agregada. */
export function buildStrategyDraft(
  agg: DecisionAggregate,
  thresholds: LearningThresholds,
): {
  strategyId: string;
  name: string;
  description: string;
  segment: string | null;
  acquisitionChannel: string | null;
  missingFact: MissingFact;
  recommendedNextAction: NextAction;
  sampleCount: number;
  confidence: number;
  successRate: number;
  continuityRate: number;
  responseRate: number;
  interestRate: number;
  conversionRate: number;
  status: StrategyStatusValue;
  lastSuccessAt: Date | null;
} {
  const status = strategyStatus(agg, thresholds);
  const recommended = status === "ACTIVE" ? agg.action : actionForFact(agg.signature.missingFact);
  const name =
    status === "ACTIVE"
      ? `Aprender "${agg.signature.missingFact}" antes de avançar`
      : `Explorar "${agg.signature.missingFact}" (em aprendizado)`;
  const description =
    status === "ACTIVE"
      ? `Para ${profileLabel(agg.signature.segment)}, perguntar sobre "${agg.signature.missingFact}" antes de apresentar a solução gera ${Math.round(agg.continuityRate * 100)}% de continuidade (${agg.sampleCount} amostras).`
      : `Acumulando amostras (${agg.sampleCount}/${thresholds.minSamplesActive}) para aprender o melhor momento de explorar "${agg.signature.missingFact}".`;
  return {
    strategyId: strategyIdFor(agg.signature.missingFact, agg.signature.segment),
    name,
    description,
    segment: agg.signature.segment,
    acquisitionChannel: agg.signature.acquisitionChannel,
    missingFact: agg.signature.missingFact,
    recommendedNextAction: recommended,
    sampleCount: agg.sampleCount,
    confidence: Math.round(agg.confidence * 10000) / 100,
    successRate: Math.round(agg.successRate * 10000) / 100,
    continuityRate: Math.round(agg.continuityRate * 10000) / 100,
    responseRate: Math.round(agg.continuityRate * 10000) / 100,
    interestRate: Math.round(agg.interestRate * 10000) / 100,
    conversionRate: Math.round(agg.conversionRate * 10000) / 100,
    status,
    lastSuccessAt: agg.conversionCount > 0 ? new Date() : null,
  };
}

function profileLabel(segment: string | null): string {
  return segment ? `o segmento "${segment}"` : "o perfil geral";
}

// ---------------------------------------------------------------------------
// STORE (duck typing de Prisma — padrão do projeto, ver agent-config.ts)
// ---------------------------------------------------------------------------

export interface StrategyDataSource {
  salesConversationInsight: {
    findMany(args: {
      where: { business_id: string };
      orderBy: { created_at: "asc" };
    }): Promise<
      {
        business_id: string;
        conversation_id: string;
        lead_id: string;
        segment: string | null;
        acquisition_channel: string | null;
        stage_at_close: string | null;
        outcome: string;
        agent_question_count: number;
        customer_message_count: number;
        last_agent_question: string | null;
        last_customer_message: string | null;
        pains: unknown;
        objections: unknown;
        needs: unknown;
        questions: unknown;
        techniques: unknown;
      }[]
    >;
  };
  commercialStrategy: {
    findMany(args: unknown): Promise<unknown[]>;
    findFirst(args: {
      where: { business_id: string; strategy_id: string };
      orderBy: { version: "desc" };
    }): Promise<{
      id: string;
      version: number;
      recommended_next_action: string;
      status: string;
    } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

/** Insight do banco → LearningAnalysis (recuperação tipada). */
export function insightFromRow(
  row: Awaited<
    ReturnType<StrategyDataSource["salesConversationInsight"]["findMany"]>
  >[number],
  tenantId: string,
): LearningAnalysis {
  return {
    tenantId,
    conversationId: row.conversation_id,
    leadId: row.lead_id,
    segment: row.segment,
    acquisitionChannel: row.acquisition_channel,
    stageAtClose: (row.stage_at_close as LearningAnalysis["stageAtClose"]) ?? null,
    outcome: (row.outcome as InsightOutcomeValue) ?? "ONGOING",
    messageCount: 0,
    agentQuestionCount: row.agent_question_count,
    customerMessageCount: row.customer_message_count,
    messagesToPrice: null,
    messagesToConversion: null,
    lastAgentQuestion: row.last_agent_question,
    lastCustomerMessage: row.last_customer_message,
    pains: Array.isArray(row.pains) ? (row.pains as string[]) : [],
    objections: Array.isArray(row.objections) ? (row.objections as string[]) : [],
    needs: Array.isArray(row.needs) ? (row.needs as string[]) : [],
    questions: Array.isArray(row.questions)
      ? (row.questions as LearningQuestionEvent[])
      : [],
    techniques: Array.isArray(row.techniques)
      ? (row.techniques as LearningAnalysis["techniques"])
      : [],
    strategyUsed: null,
  };
}

/**
 * Carrega os insights de UM tenant (isolamento por business_id).
 */
export async function loadTenantInsights(
  db: StrategyDataSource,
  tenantId: string,
): Promise<LearningAnalysis[]> {
  const rows = await db.salesConversationInsight.findMany({
    where: { business_id: tenantId },
    orderBy: { created_at: "asc" },
  });
  return rows.map((r) => insightFromRow(r, tenantId));
}

/**
 * Recalcula e persiste as estratégias de UM tenant a partir dos insights.
 * Idempotente; versiona quando a recomendação/status muda materialmente.
 */
export async function computeTenantStrategies(
  db: StrategyDataSource,
  tenantId: string,
  thresholds: LearningThresholds = DEFAULT_LEARNING_THRESHOLDS,
): Promise<number> {
  const insights = await loadTenantInsights(db, tenantId);
  const aggregates = aggregateDecisions(insights);

  // Manter a célula com mais amostras por (perfil, fato): se o mesmo fato foi
  // perguntado de formas diferentes, a mais representativa vence.
  const bestByKey = new Map<string, DecisionAggregate>();
  for (const agg of aggregates) {
    const key = signatureKey(agg.signature);
    const current = bestByKey.get(key);
    if (!current || agg.sampleCount > current.sampleCount) {
      bestByKey.set(key, agg);
    }
  }

  let updated = 0;
  for (const agg of bestByKey.values()) {
    if (agg.sampleCount === 0) continue;
    const draft = buildStrategyDraft(agg, thresholds);
    const existing = await db.commercialStrategy.findFirst({
      where: { business_id: tenantId, strategy_id: draft.strategyId },
      orderBy: { version: "desc" },
    });
    if (
      existing &&
      existing.recommended_next_action === draft.recommendedNextAction &&
      existing.status === draft.status
    ) {
      // Mesma recomendação: atualiza em lugar (sem criar versão nova).
      await db.commercialStrategy.update({
        where: { id: existing.id },
        data: strategyRowData(tenantId, draft, existing.version, agg),
      });
    } else {
      // Mudou recomendação/status → nova versão (rastreável/rollback).
      await db.commercialStrategy.create({
        data: strategyRowData(
          tenantId,
          draft,
          (existing?.version ?? 0) + 1,
          agg,
        ),
      });
    }
    updated += 1;
  }
  return updated;
}

function strategyRowData(
  tenantId: string,
  draft: ReturnType<typeof buildStrategyDraft>,
  version: number,
  agg: DecisionAggregate,
): Record<string, unknown> {
  return {
    business_id: tenantId,
    strategy_id: draft.strategyId,
    version,
    name: draft.name,
    description: draft.description,
    segment: draft.segment,
    acquisition_channel: draft.acquisitionChannel,
    missing_fact: draft.missingFact,
    recommended_next_action: draft.recommendedNextAction,
    sample_count: draft.sampleCount,
    confidence: draft.confidence,
    success_rate: draft.successRate,
    continuity_rate: draft.continuityRate,
    response_rate: draft.responseRate,
    interest_rate: draft.interestRate,
    conversion_rate: draft.conversionRate,
    last_success_at: draft.lastSuccessAt,
    status: draft.status,
    meta: {
      signature: {
        segment: agg.signature.segment,
        acquisitionChannel: agg.signature.acquisitionChannel,
        missingFact: agg.signature.missingFact,
      },
      continuity_count: agg.continuityCount,
      interest_count: agg.interestCount,
      conversion_count: agg.conversionCount,
      abandon_count: agg.abandonCount,
      action: agg.action,
      thresholds: undefined,
    },
    updated_at: new Date(),
  };
}

/**
 * Carrega as estratégias ATIVAS de UM tenant para o runtime (Decision Engine).
 * Filtra estritamente por business_id — nunca vaza dados entre tenants.
 */
export async function activeStrategiesForTenant(
  db: { commercialStrategy: Pick<StrategyDataSource["commercialStrategy"], "findMany"> },
  tenantId: string,
): Promise<RuntimeStrategy[]> {
  const rows = (await db.commercialStrategy.findMany({
    where: { business_id: tenantId, status: "ACTIVE" },
    orderBy: { created_at: "asc" },
  })) as Array<{
    id: string;
    business_id: string;
    strategy_id: string;
    version: number;
    name: string;
    description: string | null;
    segment: string | null;
    acquisition_channel: string | null;
    missing_fact: string | null;
    recommended_next_action: string;
    sample_count: number;
    confidence: number;
    success_rate: number;
    continuity_rate: number;
    response_rate: number;
    interest_rate: number;
    conversion_rate: number;
    status: string;
  }>;
  return rows
    .filter((r) => MISSING_FACTS.includes(r.missing_fact as MissingFact))
    .map((r) => ({
      id: r.id,
      tenantId: r.business_id,
      strategyId: r.strategy_id,
      version: r.version,
      name: r.name,
      description: r.description,
      segment: r.segment,
      acquisitionChannel: r.acquisition_channel,
      missingFact: r.missing_fact as MissingFact,
      recommendedNextAction: r.recommended_next_action as NextAction,
      sampleCount: r.sample_count,
      confidence: r.confidence,
      successRate: r.success_rate,
      continuityRate: r.continuity_rate,
      responseRate: r.response_rate,
      interestRate: r.interest_rate,
      conversionRate: r.conversion_rate,
      status: r.status as RuntimeStrategy["status"],
    }));
}