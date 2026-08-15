/**
 * Constrói as queries de descoberta a partir dos filtros do usuário.
 * Queries são específicas, localizadas e orientadas a estabelecimento físico
 * (evita buscas genéricas que retornam portais/agregadores).
 */

const SEGMENT_KEYWORDS: Record<string, string[]> = {
  barbearia: ["barbearia", "barber shop", "corte de cabelo masculino"],
  salao: [
    "salão de beleza",
    "salao de beleza",
    "salão de cabelo",
    "estética feminina",
  ],
  estetica: [
    "clínica de estética",
    "centro de estética",
    "estética corporal",
    "estética facial",
  ],
  academia: ["academia", "personal trainer", "estúdio de treino", "musculação"],
  "clinica odontologica": [
    "dentista",
    "clínica odontológica",
    "consultório odontológico",
    "implante dentário",
  ],
  "clinica medica": [
    "clínica médica",
    "consultório médico",
    "clínica de especialidades",
  ],
  "pet shop": [
    "pet shop",
    "banho e tosa",
    "clínica veterinária",
    "veterinário",
  ],
  restaurante: [
    "restaurante",
    "lanchonete",
    "hamburgueria",
    "pizzaria",
    "padaria",
  ],
};

const ACTIVITY_SUFFIXES = ["telefone", "whatsapp", "endereço", "site oficial"];

const stripAccents = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export interface SearchQuery {
  query: string;
  region?: { city?: string; state?: string; country?: string };
}

function keywordsFor(segment?: string): string[] {
  if (!segment) return [];
  const key = segment.toLowerCase().trim();
  if (SEGMENT_KEYWORDS[key]) return SEGMENT_KEYWORDS[key];
  return [segment.trim()];
}

/**
 * Keywords de um segmento para validação de relevância.
 * Segmentos conhecidos têm palavras-chave verificáveis; desconhecidos retornam [].
 */
export function nicheKeywords(segment?: string): string[] {
  if (!segment) return [];
  const key = stripAccents(segment).toLowerCase().trim();
  return SEGMENT_KEYWORDS[key] ?? [];
}

/** Todas as keywords de todos os nichos conhecidos (para detectar conflitos). */
export function allNicheKeywords(): string[] {
  return Object.values(SEGMENT_KEYWORDS).flat();
}

/**
 * Monta a lista de queries de descoberta.
 * Gera variações (termos × sufixos de contato × região) para dar à fonte de
 * descoberta mais chances de encontrar negócios — quanto maior a meta, mais
 * queries são montadas (até um teto). Sem isso, segmentos fora do mapa de
 * keywords gerariam 1–2 queries e a run pararia muito abaixo do solicitado.
 */
export function buildSearchQueries(params: {
  segment?: string;
  country?: string;
  state?: string;
  city?: string;
  targetQuantity: number;
}): SearchQuery[] {
  const { segment, country, state, city, targetQuantity } = params;
  const keywords = keywordsFor(segment);
  const regionParts: string[] = [];
  if (city) regionParts.push(city);
  if (state) regionParts.push(state);
  if (country) regionParts.push(country);
  const region = regionParts.join(" - ");

  // Termos de busca: keywords conhecidas OU variações do segmento digitado
  // (para segmentos fora do mapa, ainda gera várias queries).
  let terms: string[];
  if (keywords.length > 0) {
    terms = keywords;
  } else if (segment) {
    const base = segment.trim();
    terms = [base];
  } else {
    terms = ["negócios locais", "estabelecimentos"];
  }

  const queries: SearchQuery[] = [];
  for (const term of terms) {
    for (const suffix of ACTIVITY_SUFFIXES) {
      queries.push({
        query: `${term}${region ? ` ${region}` : ""} ${suffix}`,
        region: { city, state, country },
      });
    }
  }
  // Busca pela cidade sem sufixo de contato (mais resultados por região).
  if (city) {
    for (const term of terms) {
      queries.push({
        query: `${term} ${city}`,
        region: { city, state, country },
      });
    }
    // Padrões adicionais para ampliar a cobertura e "continuar buscando"
    // quando a meta de leads válidos ainda não foi atingida.
    for (const term of terms) {
      queries.push({
        query: `melhor ${term} em ${city}`,
        region: { city, state, country },
      });
      queries.push({
        query: `${term} em ${city}`,
        region: { city, state, country },
      });
    }
  }

  // Deduplica queries idênticas (ex.: termos parecidos com o mesmo sufixo).
  const seen = new Set<string>();
  const unique = queries.filter((q) => {
    const fp = queryFingerprint(q.query);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });

  // Quantas queries são necessárias para a meta (estimativa: ~2 leads
  // qualificados por query — muitos resultados brutos são descartados por
  // não terem telefone/e-mail, então buscamos mais). Nunca mais que o
  // conjunto gerado (limite razoável — evita busca infinita).
  const needed = Math.min(
    Math.max(1, Math.ceil(targetQuantity / 2)),
    unique.length,
  );
  return unique.slice(0, needed);
}

/** Converte uma query em chave estável para logging/dedupe. */
export function queryFingerprint(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]/g, "");
}
