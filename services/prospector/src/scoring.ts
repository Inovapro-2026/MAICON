/**
 * Lead Score determinístico para prospecção web.
 * Sem LLM: pontua sinais objetivos de conversão (contatos, localização, site, segmento).
 */
import { QualifiedLead } from "./types";

export type LeadQuality = "Alto" | "Médio" | "Baixo";

export const SCORE_WEIGHTS = {
  base: 20,
  hasPhone: 20,
  hasEmail: 20,
  hasInstagram: 8,
  hasWebsite: 12,
  hasCity: 10,
  hasSegment: 10,
} as const;

export function classifyScore(score: number): LeadQuality {
  if (score >= 70) return "Alto";
  if (score >= 45) return "Médio";
  return "Baixo";
}

/** Calcula a pontuação de um lead a partir dos dados extraídos. */
export function scoreLead(input: {
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  city?: string | null;
  segment?: string;
  address?: string;
}): number {
  let score = SCORE_WEIGHTS.base;
  if (input.phone) score += SCORE_WEIGHTS.hasPhone;
  if (input.email) score += SCORE_WEIGHTS.hasEmail;
  if (input.instagram) score += SCORE_WEIGHTS.hasInstagram;
  if (input.website) score += SCORE_WEIGHTS.hasWebsite;
  if (input.city) score += SCORE_WEIGHTS.hasCity;
  if (input.address) score += 5;
  if (input.segment) score += SCORE_WEIGHTS.hasSegment;
  return Math.min(score, 95);
}

/** Métricas agregadas para o resumo da run. */
export function summarizeScores(scores: number[]): {
  avgScore: number;
  high: number;
  medium: number;
  low: number;
} {
  if (scores.length === 0) return { avgScore: 0, high: 0, medium: 0, low: 0 };
  const avgScore = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const s of scores) {
    const q = classifyScore(s);
    if (q === "Alto") high += 1;
    else if (q === "Médio") medium += 1;
    else low += 1;
  }
  return { avgScore, high, medium, low };
}

export type { QualifiedLead };
