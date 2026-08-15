/**
 * Query builder da Overpass API (OpenStreetMap).
 * Converte Segmento/Nicho + bounding box em uma query Overpass QL e converte
 * os elementos OSM (node/way) em SearchResult compatíveis com o pipeline.
 *
 * Fonte gratuita: NÃO depende de chave de API e NÃO faz scraping de Google Maps
 * (violaria os Termos de Serviço). O mapa de segmentos é versionável aqui.
 */
import { SearchResult } from "../types";

/** Bounding box geográfica (Overpass usa (south,west,north,east)). */
export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface OverpassElement {
  type: "node" | "way" | "relation" | string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Mapeamento canônico de segmento (chaves de normalizeNiche/query-builder)
 * para filtros de tags OSM. Cada filtro é aplicado a node/way dentro do bbox.
 *
 * REGRA: NUNCA é uma lista fechada de nichos suportados. Segmentos sem
 * correspondência direta caem em um fallback de BUSCA POR NOME
 * (`["name"~"termo",i]`), para que QUALQUER nicho digitado seja procurado de
 * verdade — nunca "não suportado".
 */
export const OSM_SEGMENT_MAP: Array<{
  keywords: string[];
  filters: string[];
}> = [
  // --- Beleza / cuidados ---
  {
    keywords: ["barbearia", "barbearias", "barber", "barber shop"],
    filters: [
      '["shop"="hairdresser"]',
      '["shop"="barber"]',
      '["amenity"="barber_school"]',
    ],
  },
  {
    keywords: [
      "salão de beleza",
      "salao de beleza",
      "salão",
      "salao",
      "cabeleireiro",
      "cabeleireiros",
      "manicure",
      "unha",
      "estética",
      "estetica",
      "spa",
      "cosmético",
      "cosmetic",
    ],
    filters: [
      '["shop"="hairdresser"]',
      '["shop"="beauty"]',
      '["shop"="cosmetics"]',
    ],
  },
  {
    keywords: ["tatuagem", "tattoo", "estúdio de tatuagem"],
    filters: ['["shop"="tattoo"]'],
  },
  {
    keywords: ["academia", "academias", "crossfit", "musculação", "personal trainer", "pilates"],
    filters: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'],
  },
  // --- Alimentação ---
  {
    keywords: ["restaurante", "restaurantes", "churrascaria", "pizzaria"],
    filters: ['["amenity"="restaurant"]'],
  },
  { keywords: ["padaria"], filters: ['["shop"="bakery"]'] },
  {
    keywords: ["lanchonete", "hamburgueria", "hamburguer", "fast food"],
    filters: ['["amenity"="fast_food"]'],
  },
  { keywords: ["cafeteria", "café", "cafe", "coffee"], filters: ['["amenity"="cafe"]'] },
  { keywords: ["bar", "pub", "botequim"], filters: ['["amenity"="bar"]'] },
  { keywords: ["sorveteria", "sorvete"], filters: ['["shop"="ice_cream"]'] },
  {
    keywords: ["confeitaria", "doceria", "doce", "bolo", "bolos"],
    filters: ['["shop"="confectionery"]'],
  },
  { keywords: ["quitanda", "hortifruti", "sacolão"], filters: ['["shop"="greengrocer"]'] },
  { keywords: ["açougue", "acougue", "carnes"], filters: ['["shop"="butcher"]'] },
  {
    keywords: ["distribuidora de bebidas", "adega", "bebidas", "cervejaria"],
    filters: ['["shop"="alcohol"]', '["shop"="beverages"]'],
  },
  // --- Comércio / lojas ---
  {
    keywords: [
      "loja de roupas",
      "roupas",
      "vestuário",
      "vestuario",
      "moda",
      "boutique",
    ],
    filters: ['["shop"="clothes"]'],
  },
  {
    keywords: ["calçados", "calcados", "sapatos", "tênis", "tenis"],
    filters: ['["shop"="shoes"]'],
  },
  { keywords: ["farmácia", "farmacia", "drogaria"], filters: ['["amenity"="pharmacy"]'] },
  {
    keywords: ["supermercado", "mercado", "mercadinho", "mercearia"],
    filters: ['["shop"="supermarket"]', '["shop"="convenience"]'],
  },
  { keywords: ["floricultura", "flores"], filters: ['["shop"="florist"]'] },
  { keywords: ["joalheria", "joias"], filters: ['["shop"="jewelry"]'] },
  { keywords: ["ótica", "otica", "óculos", "oculos"], filters: ['["shop"="optician"]'] },
  { keywords: ["presentes", "brinquedos"], filters: ['["shop"="toys"]', '["shop"="gift"]'] },
  { keywords: ["livraria", "livros"], filters: ['["shop"="books"]'] },
  { keywords: ["papelaria", "material escolar"], filters: ['["shop"="stationery"]'] },
  {
    keywords: ["eletrodomésticos", "eletronicos", "eletrônicos", "informática", "informatica"],
    filters: ['["shop"="electronics"]'],
  },
  { keywords: ["celular", "celulares", "telefonia"], filters: ['["shop"="mobile_phone"]'] },
  { keywords: ["computador", "computadores"], filters: ['["shop"="computer"]'] },
  {
    keywords: ["móveis", "moveis", "marcenaria"],
    filters: ['["shop"="furniture"]'],
  },
  {
    keywords: ["material de construção", "construção", "construcao"],
    filters: ['["shop"="doityourself"]', '["shop"="hardware"]'],
  },
  { keywords: ["instrumentos musicais", "musical"], filters: ['["shop"="music"]'] },
  { keywords: ["artigos esportivos", "esportes"], filters: ['["shop"="sports"]'] },
  {
    keywords: ["concessionária", "concessionaria", "carros", "veículos", "veiculos"],
    filters: ['["shop"="car"]'],
  },
  // --- Serviços / oficinas ---
  {
    keywords: ["oficina mecânica", "oficina mecanica", "mecânica", "mecanica"],
    filters: ['["shop"="car_repair"]', '["shop"="mechanic"]'],
  },
  { keywords: ["lava rápido", "lava rapido", "lavagem", "car wash"], filters: ['["amenity"="car_wash"]'] },
  { keywords: ["posto de gasolina", "combustível", "combustivel"], filters: ['["amenity"="fuel"]'] },
  { keywords: ["estacionamento"], filters: ['["amenity"="parking"]'] },
  { keywords: ["autoescola", "auto escola"], filters: ['["amenity"="driving_school"]'] },
  // --- Imóveis / negócios / escritórios ---
  {
    keywords: ["imobiliária", "imobiliaria", "imóveis", "imoveis"],
    filters: ['["office"="estate_agent"]'],
  },
  { keywords: ["agência de viagens", "agencia de viagens", "viagens"], filters: ['["shop"="travel_agency"]'] },
  {
    keywords: ["agência de marketing", "agencia de marketing", "marketing", "publicidade"],
    filters: ['["office"="advertising_agency"]'],
  },
  {
    keywords: ["escritório de advocacia", "advocacia", "advogado", "advogados"],
    filters: ['["office"="lawyer"]'],
  },
  {
    keywords: ["contabilidade", "escritório de contabilidade", "contador"],
    filters: ['["office"="accountant"]'],
  },
  { keywords: ["consultoria", "consultoria empresarial"], filters: ['["office"="consulting"]'] },
  { keywords: ["engenharia", "arquitetura"], filters: ['["office"="architect"]', '["office"="engineer"]'] },
  { keywords: ["tradutor", "tradução", "traducao"], filters: ['["office"="translator"]'] },
  // --- Saúde ---
  {
    keywords: ["clínica médica", "clinica medica", "consultório médico", "consultorio medico"],
    filters: ['["amenity"="clinic"]', '["amenity"="doctors"]', '["healthcare"="clinic"]'],
  },
  {
    keywords: [
      "clínica odontológica",
      "clinica odontologica",
      "dentista",
      "odontologia",
      "implante dentário",
    ],
    filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
  },
  {
    keywords: ["fisioterapia", "fisioterapeuta"],
    filters: ['["healthcare"="physiotherapist"]', '["amenity"="clinic"]'],
  },
  {
    keywords: ["psicólogo", "psicologo", "psicologia", "terapia"],
    filters: ['["office"="psychologist"]', '["healthcare"="psychotherapist"]'],
  },
  { keywords: ["hospital", "pronto socorro"], filters: ['["amenity"="hospital"]'] },
  { keywords: ["laboratório", "laboratorio", "análises clínicas"], filters: ['["healthcare"="laboratory"]'] },
  {
    keywords: ["pet shop", "pet", "petshop", "veterinária", "veterinario", "veterinário", "banho e tosa"],
    filters: ['["shop"="pet"]', '["amenity"="veterinary"]'],
  },
  // --- Educação / lazer ---
  {
    keywords: ["escola", "colégio", "colegio"],
    filters: ['["amenity"="school"]'],
  },
  { keywords: ["creche", "educação infantil"], filters: ['["amenity"="childcare"]'] },
  {
    keywords: ["faculdade", "universidade", "cursinho"],
    filters: ['["amenity"="college"]', '["amenity"="university"]'],
  },
  { keywords: ["escola de dança", "dança", "balé"], filters: ['["leisure"="sports_centre"]'] },
  { keywords: ["cinema"], filters: ['["amenity"="cinema"]'] },
  { keywords: ["teatro"], filters: ['["amenity"="theatre"]'] },
  { keywords: ["igreja", "templo", "capela"], filters: ['["amenity"="place_of_worship"]'] },
  // --- Hospedagem / outros ---
  {
    keywords: ["hotel", "pousada", "hostel", "motel"],
    filters: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="hostel"]'],
  },
  { keywords: ["salão de festas", "buffet", "espaço de eventos"], filters: ['["amenity"="events_venue"]'] },
  { keywords: ["banco", "agência bancária"], filters: ['["amenity"="bank"]'] },
  { keywords: ["correio", "agência dos correios"], filters: ['["amenity"="post_office"]'] },
  { keywords: ["funerária", "funeraria", "velório"], filters: ['["shop"="funeral_directors"]'] },
  { keywords: ["lavanderia", "tinturaria"], filters: ['["shop"="laundry"]', '["shop"="dry_cleaning"]'] },
  { keywords: ["sapataria", "conserto de sapatos"], filters: ['["craft"="shoemaker"]'] },
  { keywords: ["relojoaria", "relógios"], filters: ['["shop"="watches"]'] },
  { keywords: ["chaveiro", "cópia de chaves"], filters: ['["craft"="locksmith"]'] },
  {
    keywords: ["eletricista", "encanador", "pedreiro"],
    filters: ['["office"="company"]', '["craft"="electrician"]', '["craft"="plumber"]'],
  },
];

const stripAccents = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

/** Erros de digitação comuns (ex.: "Barbeira" -> "barbearia"). */
const COMMON_TYPOS: Record<string, string> = {
  barbeira: "barbearia",
  barbearias: "barbearia",
  saloes: "salao",
  saloesdebeleza: "salao",
  esteticas: "estetica",
  academias: "academia",
  dentistas: "dentista",
  restaurantes: "restaurante",
  pizzarias: "pizzaria",
  lanchonetes: "lanchonete",
  hamburguerias: "hamburgueria",
  farmacias: "farmacia",
  drogarias: "drogaria",
  veterinarios: "veterinario",
  imobiliarias: "imobiliaria",
  advogados: "advogado",
  oficinas: "oficina",
  petshops: "petshop",
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface OverpassSegmentMapping {
  filters: string[];
  /** true = tag OSM mapeado; false = fallback por nome (sem tag direta). */
  direct: boolean;
}

/**
 * Retorna os filtros Overpass para um segmento QUALQUER (texto livre).
 * - Segmentos com tag conhecida → filtros de tags.
 * - Segmentos sem tag direta → fallback de BUSCA POR NOME (nunca "não suportado").
 * Correspondência fuzzy: ignora acentos/caixa/espaços e aceita variações e
 * plurais (ex.: "Barbearia", "barbearias", "barber shop" → hairdresser).
 */
export function segmentToOverpassFilters(
  segment?: string,
): OverpassSegmentMapping {
  if (!segment) {
    return { filters: ['["name"~"",i]'], direct: false };
  }
  const stripped = stripAccents(segment);
  const norm = COMMON_TYPOS[stripped] ?? stripped;
  if (!norm) return { filters: ['["name"~"",i]'], direct: false };

  // 1) Match EXATO por keyword normalizada.
  for (const entry of OSM_SEGMENT_MAP) {
    for (const kw of entry.keywords) {
      if (norm === stripAccents(kw)) {
        return { filters: entry.filters, direct: true };
      }
    }
  }

  // 2) Match por CONTEÚDO: o termo contém a keyword ou vice-versa.
  //    Keyword mais longa vence (mais específica). Mín. 4 chars para evitar
  //    falsos positivos ("bar" dentro de "barbearia").
  let best: { filters: string[]; len: number } | null = null;
  for (const entry of OSM_SEGMENT_MAP) {
    for (const kw of entry.keywords) {
      const kn = stripAccents(kw);
      if (kn.length < 4) continue;
      if (norm.includes(kn) || kn.includes(norm)) {
        if (!best || kn.length > best.len) {
          best = { filters: entry.filters, len: kn.length };
        }
      }
    }
  }
  if (best) return { filters: best.filters, direct: true };

  // 3) Fallback: busca por nome contendo o termo digitado (honesto — pode
  //    retornar 0 resultados, mas nunca "não suportado").
  return {
    filters: [`["name"~"${escapeRegex(segment.trim())}",i]`],
    direct: false,
  };
}

/** true quando o segmento tem uma tag OSM direta mapeada (não fallback). */
export function isSegmentDirectMapped(segment?: string): boolean {
  return segmentToOverpassFilters(segment).direct;
}

export interface BuildOverpassQueryParams {
  filters: string[];
  bbox: GeoBBox;
  limit: number;
  timeoutSeconds: number;
}

/** Monta a query Overpass QL. `out center` cobre node e way. */
export function buildOverpassQuery(params: BuildOverpassQueryParams): string {
  const { filters, bbox, limit, timeoutSeconds } = params;
  const { south, west, north, east } = bbox;
  const union = filters
    .map(
      (f) =>
        `node${f}(${south},${west},${north},${east});\n  way${f}(${south},${west},${north},${east});`,
    )
    .join("\n  ");
  return `[out:json][timeout:${Math.max(25, timeoutSeconds)}];\n(\n  ${union}\n);\nout center ${Math.max(1, limit)};`;
}

const SOCIAL_HOST_RE = /instagram|facebook|whatsapp|twitter|t\.me|linkedin/i;

/** Escolhe o site institucional do negócio (não social). */
export function pickWebsite(tags: Record<string, string>): string | undefined {
  for (const key of ["website", "contact:website", "url"]) {
    const raw = tags[key];
    if (!raw) continue;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (SOCIAL_HOST_RE.test(u.hostname)) continue;
      return u.toString().replace(/\/$/, "");
    } catch {
      // URL inválida — ignora.
    }
  }
  return undefined;
}

/** Formata os dígitos de um telefone para texto parseável pelo normalizador. */
function phoneToText(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = raw.replace(/\D/g, "");
  let local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length === 10 || local.length === 11) {
    const area = local.slice(0, 2);
    const num = local.slice(2);
    if (num.length === 9) return `(${area}) ${num.slice(0, 5)}-${num.slice(5)}`;
    return `(${area}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  return undefined;
}

/** Instagram handle sem arroba, quando presente nos tags. */
function instagramFromTags(tags: Record<string, string>): string | undefined {
  const raw = tags["contact:instagram"] ?? tags["instagram"];
  if (!raw) return undefined;
  const handle = raw.trim().replace(/^@/, "").split("/").pop() ?? "";
  return handle.length >= 3 ? handle : undefined;
}

/**
 * Converte elementos OSM em SearchResult. O title/description são montados com
 * os dados reais dos tags (nome, telefone, e-mail, instagram, horário e
 * Cidade - UF), para o normalizador/validador do pipeline funcionar sem
 * fabricar nada.
 */
export function parseOverpassElements(
  elements: OverpassElement[],
  fallbackCity?: string,
  fallbackState?: string,
): SearchResult[] {
  const results: SearchResult[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = (tags.name ?? "").trim();
    if (!name) continue;
    if (["opening_hours", "note"].includes(name.toLowerCase())) continue;

    const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    const website = pickWebsite(tags);
    const city = tags["addr:city"]?.trim() || fallbackCity;
    const state = tags["addr:state"]?.trim() || fallbackState;

    const parts: string[] = [];
    const phone = phoneToText(tags.phone) ?? phoneToText(tags["contact:phone"]);
    if (phone) parts.push(phone);
    const email = tags.email ?? tags["contact:email"];
    if (email) parts.push(email.trim());
    const instagram = instagramFromTags(tags);
    if (instagram) parts.push(`Instagram: @${instagram}`);
    if (tags.opening_hours) parts.push(tags.opening_hours);
    if (city) parts.push(state ? `${city} - ${state}` : city);
    else if (state) parts.push(state);

    results.push({
      url: website ?? osmUrl,
      title: name,
      description: parts.join(" · ").slice(0, 500),
    });
  }
  return results;
}
