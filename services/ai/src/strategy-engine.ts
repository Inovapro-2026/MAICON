/**
 * STRATEGY ENGINE (runtime) — SAVYRON.
 *
 * Conecta o que o tenant aprendeu (estratégias ativas) ao Decision Engine:
 * dados o perfil do lead, os fatos conhecidos e as perguntas já feitas,
 * recomenda o PRÓXIMO PASSO de descoberta com maior chance de continuidade.
 *
 * Regras de runtime:
 * - Só considera estratégias ACTIVE com confiança/amostras suficientes
 *   (os limites já foram aplicados em `computeTenantStrategies`).
 * - Nunca recomenda perguntar um fato que o cliente JÁ informou (known).
 * - Nunca recomenda repetir uma ação de descoberta já executada (asked_actions).
 * - Perfil: casa por segmento/canal de aquisição, com fallback para o perfil
 *   genérico ("*") do tenant quando não houver match exato.
 * - Toda consulta é por tenant (o array `strategies` já veio filtrado).
 */
import { NextAction } from "./commercial-engine";
import {
  MISSING_FACTS,
  MissingFact,
  RuntimeStrategy,
  StrategyRecommendation,
} from "./learning/types";

/** Fatos que o lead ainda não revelou (lacunas de informação). */
export function computeMissingFacts(known: {
  name?: { value: string } | null;
  segment?: { value: string } | null;
  need?: { value: string } | null;
  acquisition_channel?: { value: string } | null;
  pain?: { value: string } | null;
  objective?: { value: string } | null;
  budget?: { value: string } | null;
  objection?: { value: string } | null;
  tools?: { value: string } | null;
}): MissingFact[] {
  return MISSING_FACTS.filter((f) => {
    const fact = known[f];
    return !fact || !fact.value || !String(fact.value).trim();
  });
}

function norm(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Recomenda a próxima ação de descoberta a partir das estratégias do tenant.
 * Retorna null quando não há estratégia ativa aplicável (o Decision Engine
 * segue a regra padrão de descoberta).
 */
export function recommendNextAction(
  strategies: RuntimeStrategy[],
  opts: {
    known: Parameters<typeof computeMissingFacts>[0];
    askedActions?: string[];
    askedQuestions?: string[];
    minConfidence?: number; // 0-100; default 60
  },
): StrategyRecommendation | null {
  const minConfidence = opts.minConfidence ?? 60;
  const askedActions = new Set(opts.askedActions ?? []);
  const knownKeys = new Set(
    Object.entries(opts.known ?? {})
      .filter(([, v]) => v && v.value && String(v.value).trim())
      .map(([k]) => k),
  );

  const candidates = strategies
    .filter((s) => s.status === "ACTIVE")
    .filter((s) => s.confidence >= minConfidence)
    .filter((s) => s.missingFact && MISSING_FACTS.includes(s.missingFact))
    // Nunca recomendar perguntar algo que o lead já revelou.
    .filter((s) => s.missingFact && !knownKeys.has(s.missingFact))
    // Nunca recomendar repetir uma ação de descoberta já executada.
    .filter((s) => !askedActions.has(s.recommendedNextAction))
    // Nunca repetir uma pergunta já feita (quando a memória captura o texto).
    .filter(
      (s) =>
        !opts.askedQuestions?.some(
          (q) => norm(q).includes(norm(s.name)) || norm(q).includes(norm(s.missingFact)),
        ),
    )
    // Perfil: match exato de segmento/canal, com fallback para genérico.
    .sort((a, b) => {
      const scoreA = profileScore(a, opts.known);
      const scoreB = profileScore(b, opts.known);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.confidence - a.confidence;
    });

  const best = candidates[0] ?? null;
  if (!best || !best.missingFact) return null;

  return {
    strategyId: best.strategyId,
    strategyVersion: best.version,
    tenantId: best.tenantId,
    name: best.name,
    reason: `Estratégia "${best.name}" (${best.sampleCount} amostras, ${best.confidence}% confiança) indica que perguntar "${best.missingFact}" gera ${best.continuityRate}% de continuidade para este perfil.`,
    missingFact: best.missingFact,
    nextAction: best.recommendedNextAction,
    confidence: best.confidence,
    sampleCount: best.sampleCount,
    continuityRate: best.continuityRate,
  };
}

/** Quão próximo o perfil da estratégia está do lead atual (0 = genérico). */
function profileScore(
  s: RuntimeStrategy,
  known: Parameters<typeof computeMissingFacts>[0],
): number {
  let score = 0;
  if (s.segment) {
    score += norm(s.segment) === norm(known.segment?.value) ? 2 : -2;
  }
  if (s.acquisitionChannel) {
    score +=
      norm(s.acquisitionChannel) === norm(known.acquisition_channel?.value)
        ? 2
        : -2;
  }
  return score;
}