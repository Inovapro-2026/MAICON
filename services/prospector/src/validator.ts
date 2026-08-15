/**
 * Validação de candidatos de prospecção web.
 * Descarta páginas genéricas, agregadores, portais e qualquer dado fabricado —
 * o alvo é o estabelecimento real encontrado pelo mecanismo de descoberta.
 */
import { normalizeEmail, normalizePhone } from "@prospector/utils";
import {
  FABRICATED_DOMAIN_RE,
  sameText,
  extractLocationFromText,
} from "./normalizer";
import { allNicheKeywords, nicheKeywords } from "./query-builder";
import { DiscardReason } from "./types";

const GENERIC_TITLE_RE =
  /(página não encontrada|erro 404|página inicial|home|início|resultados|busca|pesquisa|404|portal|guia|directório|diretorio|lista|lista de|empresas em|telefones|yellow pages|páginas amarelas|anúncio|anuncio|patrocinado)/i;

const BUSINESS_HINT_RE =
  /(barbearia|barber|salão|salao|estética|estetica|academia|clínica|clinica|consultório|consultorio|dentista|pet shop|restaurante|lanchonete|hamburgueria|padaria|café|cafe|estúdio|estudio|studio|beauty|cosmético|cosmetic|spa)/i;

const GENERIC_NAME_RE =
  /(google|facebook|instagram|whatsapp|mercado livre|iugu|resultado|portal|guia|lista|diretorio|directory|index|home|inicio)/i;

export interface CandidateValidation {
  valid: boolean;
  reason?: DiscardReason;
}

/** Valida um candidato extraído de um resultado de busca. */
export function validateCandidate(input: {
  name: string;
  city?: string | null;
  state?: string | null;
  website?: string;
  phone?: string;
  email?: string;
  title: string;
  description?: string;
}): CandidateValidation {
  const name = (input.name ?? "").trim();
  const title = (input.title ?? "").trim();
  const combined = `${title} ${input.description ?? ""}`;

  // Precisa de um nome de negócio.
  if (!name) return { valid: false, reason: "NO_NAME" };

  // Nome genérico/portal.
  if (GENERIC_NAME_RE.test(name))
    return { valid: false, reason: "NOT_A_BUSINESS" };

  // Título de página genérica (404, resultados, portais).
  if (GENERIC_TITLE_RE.test(title) && !BUSINESS_HINT_RE.test(title)) {
    return { valid: false, reason: "GENERIC_PAGE" };
  }

  // Sem sinal de localização OU contato, não conseguimos qualificar.
  const hasContact = Boolean(input.phone || input.email || input.website);
  const hasLocation = Boolean(input.city || input.state);
  if (!hasLocation && !hasContact)
    return { valid: false, reason: "NO_LOCATION_OR_CONTACT" };

  // Sem nenhum sinal de negócio real (bem genérico demais).
  if (!BUSINESS_HINT_RE.test(combined) && !input.website && !hasContact) {
    return { valid: false, reason: "NOT_A_BUSINESS" };
  }

  return { valid: true };
}

/** Região alvo informada pelo usuário, usada na validação de relevância/localização. */
export interface RequestedRegion {
  segment?: string;
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Camada de integridade de dados — valida que o resultado REALMENTE veio do
 * provider e é coerente com a busca. Rejeita qualquer dado fabricado.
 *
 * Regras:
 * - source_url obrigatória e com domínio real (não-fabricado);
 * - e-mail/telefone nunca fabricados; se presentes, precisam ser válidos;
 * - relevância de nicho (resultado deve pertencer ao nicho solicitado);
 * - localização coerente com a região solicitada.
 */
export function validateDiscoveredLead(
  input: {
    name: string;
    sourceUrl?: string | null;
    website?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    title?: string;
    description?: string;
    contentPreview?: string;
  },
  requested: RequestedRegion = {},
): CandidateValidation {
  const name = (input.name ?? "").trim();
  if (!name) return { valid: false, reason: "NO_NAME" };

  // --- Origem verificável: source_url obrigatória e real.
  const sourceUrl = input.sourceUrl?.trim();
  if (!sourceUrl) return { valid: false, reason: "NO_SOURCE_URL" };
  if (!/^https?:\/\//i.test(sourceUrl))
    return { valid: false, reason: "INVALID_SOURCE_URL" };
  if (FABRICATED_DOMAIN_RE.test(sourceUrl))
    return { valid: false, reason: "FABRICATED_DOMAIN" };

  if (input.website && FABRICATED_DOMAIN_RE.test(input.website)) {
    return { valid: false, reason: "FABRICATED_DOMAIN" };
  }

  // --- Telefone nunca fabricado; se presente, precisa ser válido.
  if (input.phone && !normalizePhone(input.phone)) {
    return { valid: false, reason: "INVALID_PHONE" };
  }

  // --- E-mail nunca fabricado; se presente, precisa ser válido e de domínio real.
  if (input.email) {
    const normalizedEmail = normalizeEmail(input.email);
    if (!normalizedEmail) return { valid: false, reason: "INVALID_EMAIL" };
    if (FABRICATED_DOMAIN_RE.test(normalizedEmail)) {
      return { valid: false, reason: "FABRICATED_EMAIL" };
    }
  }

  // --- Relevância de nicho: o resultado precisa pertencer ao nicho solicitado.
  if (requested.segment) {
    const text = `${name} ${input.title ?? ""} ${input.description ?? ""} ${input.contentPreview ?? ""} ${sourceUrl}`;
    const relevance = nicheRelevance(requested.segment, text);
    if (!relevance.ok) return { valid: false, reason: relevance.reason };
  }

  // --- Localização: se houver evidência explícita, precisa ser compatível.
  const location = validateLocation(input, requested);
  if (!location.ok) return { valid: false, reason: location.reason };

  return { valid: true };
}

/**
 * Relevância de nicho:
 * - se o segmento solicitado é conhecido, exige pelo menos 1 keyword presente;
 * - se o texto aponta fortemente para OUTRO nicho conhecido, rejeita.
 */
function nicheRelevance(
  segment: string,
  text: string,
): { ok: boolean; reason?: DiscardReason } {
  const requested = nicheKeywords(segment);
  if (requested.length === 0) return { ok: true };
  const haystack = text.toLowerCase();
  const normalizedHaystack = haystack
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Conflito forte com outro nicho conhecido.
  const ALL = allNicheKeywords();
  for (const kw of ALL) {
    const normalizedKw = kw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalizedKw.length < 3) continue;
    if (normalizedHaystack.includes(normalizedKw)) {
      // É keyword do próprio nicho? não é conflito.
      if (
        requested.some(
          (r) =>
            r.toLowerCase().includes(normalizedKw) ||
            normalizedKw.includes(r.toLowerCase()),
        )
      )
        continue;
      return { ok: false, reason: "NICHE_MISMATCH" };
    }
  }

  // Exige sinal do nicho solicitado.
  for (const kw of requested) {
    const normalizedKw = kw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalizedHaystack.includes(normalizedKw)) return { ok: true };
  }
  return { ok: false, reason: "NICHE_MISMATCH" };
}

/** Valida coerência de localização entre o resultado e a região solicitada. */
function validateLocation(
  input: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
    title?: string;
    description?: string;
    contentPreview?: string;
  },
  requested: RequestedRegion,
): { ok: boolean; reason?: DiscardReason } {
  const { city, state, country } = input;

  if (requested.state && state && !sameText(state, requested.state)) {
    return { ok: false, reason: "LOCATION_MISMATCH" };
  }
  if (requested.city && city && !sameText(city, requested.city)) {
    return { ok: false, reason: "LOCATION_MISMATCH" };
  }
  if (requested.country && country && !sameText(country, requested.country)) {
    return { ok: false, reason: "LOCATION_MISMATCH" };
  }

  // Evidência explícita no conteúdo que conflite com a cidade/estado alvo.
  const text = `${input.title ?? ""} ${input.description ?? ""} ${input.contentPreview ?? ""}`;
  const evidence = extractLocationFromText(text);
  if (evidence) {
    if (
      requested.state &&
      evidence.state &&
      !sameText(evidence.state, requested.state)
    ) {
      return { ok: false, reason: "LOCATION_MISMATCH" };
    }
    if (
      requested.city &&
      evidence.city &&
      !sameText(evidence.city, requested.city)
    ) {
      return { ok: false, reason: "LOCATION_MISMATCH" };
    }
  }

  return { ok: true };
}
