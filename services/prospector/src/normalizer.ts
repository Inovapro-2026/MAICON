/**
 * Normalização para prospecção web:
 * domínio, cidade/estado, nome de negócio e extração de contatos de conteúdo crawleado.
 */
import { normalizeEmail, normalizePhone } from "@prospector/utils";

const stripAccents = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Domínios e padrões sabidamente fictícios ou de template.
 * Nenhum resultado real de descoberta pode conter estes domínios.
 */
export const FABRICATED_DOMAIN_RE =
  /(example\.com|example\.org|exemplo\.com|exemplo\.com\.br|example\.com\.br|test\.com|\.test\b|\.invalid\b|\.local\b|localhost|seudominio|seudomain|dominio\.com|domain\.com|seusite|meusite|nomedosite|email\.com|mailinator|yopmail|guerrillamail|tempmail|foo\.com|foo\.bar|sentry\.io|\.ingest\.sentry\.io)/i;

/** Compara dois textos ignorando acentos, caixa e espaços. */
export function sameText(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return (
    stripAccents(a).replace(/\s+/g, "").trim() ===
    stripAccents(b).replace(/\s+/g, "").trim()
  );
}

const BR_UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

const CITY_STATE_RE =
  /([A-ZÁ-Úa-zá-ú0-9][\wá-úÁ-Ú0-9 ]{1,40}?)\s*[-–,]\s*([A-Z]{2})(?!\w)/g;

/** Palavras de ligação de frase — indicam que o trecho é sentença, não cidade. */
const SENTENCE_WORDS_RE =
  /\b(?:em|na|no|das|dos|para|perto|próximo|proximo)\b/i;

/** Substantivos de negócio — "Barbearia Imperial - SP" não é cidade. */
const BUSINESS_NOUN_RE =
  /\b(?:barbearia|barber|salao|salão|estetica|estética|academia|clinica|clínica|consultorio|consultório|dentista|restaurante|pizzaria|hamburgueria|lanchonete|padaria|studio|estúdio|beauty|pet shop|veterinário|veterinario)\b/i;

/**
 * Extrai evidência explícita de localização ("Cidade - UF") de um texto.
 * Só aceita UF válida e descarta falsos positivos:
 * - trechos com conectores de frase ("Cortes em São Paulo - SP");
 * - nomes de negócio precedendo a UF ("Barbearia Imperial - SP").
 */
export function extractLocationFromText(text: string): {
  city?: string;
  state?: string;
} | null {
  if (!text) return null;
  const matches: Array<{ city: string; state: string }> = [];
  for (const m of text.matchAll(CITY_STATE_RE)) {
    const city = m[1].trim();
    const state = m[2].toUpperCase();
    if (!city || !BR_UFS.includes(state)) continue;
    if (SENTENCE_WORDS_RE.test(city)) continue;
    if (BUSINESS_NOUN_RE.test(city)) continue;
    if (city.length > 60) continue;
    matches.push({ city, state });
  }
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

/** Normaliza o nicho digitado para uma chave canônica de segmento, quando reconhecível. */
export function normalizeNiche(term?: string): {
  original: string;
  normalized: string | null;
} {
  const original = (term ?? "").trim();
  if (!original) return { original, normalized: null };
  const key = stripAccents(original)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const typos: Record<string, string> = {
    barbeira: "barbearia",
    barbearias: "barbearia",
    saloes: "salao",
    saloesdebeleza: "salao",
    esteticas: "estetica",
    academias: "academia",
    dentista: "clinica odontologica",
    dentistas: "clinica odontologica",
    clinicasodonto: "clinica odontologica",
    pet: "pet shop",
    petshops: "pet shop",
    restaurantes: "restaurante",
    pizzarias: "restaurante",
  };
  const normalized = typos[key] ?? null;
  return { original, normalized };
}

/** Extrai o domínio registrável de uma URL (subdomínios removidos). */
export function normalizeDomain(url: string): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const parts = host.split(".");
    // Remove subdomínios comuns: www, m, loja...
    while (
      parts.length > 2 &&
      ["www", "m", "mobile", "loja", "shop"].includes(parts[0])
    ) {
      parts.shift();
    }
    return parts.length >= 2 ? parts.join(".") : host;
  } catch {
    return null;
  }
}

/** Normaliza nome de negócio (título limpo, sem variações de página). */
export function normalizeBusinessName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Converte sigla de estado (ou nome) em UF de 2 letras, quando possível. */
export function normalizeState(value?: string | null): string | null {
  if (!value) return null;
  const v = stripAccents(value)
    .replace(/[^a-z]/g, "")
    .toUpperCase();
  if (v.length === 2) return v;
  if (v.length > 2) return v.slice(0, 2);
  return null;
}

/** Normaliza cidade (título simples). */
export function normalizeCity(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim().replace(/\s+/g, " ");
  return v ? v.slice(0, 120) : null;
}

const COUNTRY_CODES: Record<string, string> = {
  BR: "Brasil",
  BRA: "Brasil",
  BRASIL: "Brasil",
  "": "Brasil",
};

/** Normaliza país para nome canônico. */
export function normalizeCountry(value?: string | null): string {
  const v = (value ?? "").trim().toUpperCase();
  if (!v) return "Brasil";
  if (COUNTRY_CODES[v]) return COUNTRY_CODES[v];
  return value!.trim();
}

const PHONE_RE =
  /(?:\+?\d{1,3}[\s()-]*)?(?:\(\d{2,3}\)[\s()-]*)?\d{4,5}[\s()-]*\d{4}/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const INSTAGRAM_RE = /@([a-zA-Z0-9_.]{3,30})/g;

/** Extrai uma lista de telefones E.164 de um texto. */
export function extractPhones(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const candidates = text.match(PHONE_RE) ?? [];
  for (const raw of candidates) {
    const cleaned = raw.replace(/[^\d+]/g, "");
    const phone = normalizePhone(cleaned);
    if (phone) found.add(phone);
  }
  return [...found].slice(0, 5);
}

/** Extrai uma lista de e-mails de um texto. */
export function extractEmails(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const raw of text.match(EMAIL_RE) ?? []) {
    const email = normalizeEmail(raw);
    if (email && !FABRICATED_DOMAIN_RE.test(email)) {
      found.add(email);
    }
  }
  return [...found].slice(0, 3);
}

/** Extrai handle de Instagram de um texto. */
export function extractInstagram(text: string): string | undefined {
  if (!text) return undefined;
  const matches = text.match(INSTAGRAM_RE);
  if (!matches) return undefined;
  for (const raw of matches) {
    const handle = raw.slice(1);
    if (handle.length >= 3 && !/instagram|facebook|whatsapp/i.test(handle)) {
      return handle;
    }
  }
  return undefined;
}

/** Normaliza um endereço bruto. */
export function normalizeAddress(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim().replace(/\s+/g, " ").slice(0, 255);
  return v || null;
}

/** Fingerprint domínio + cidade para deduplicação. */
export function domainCityFingerprint(
  domain?: string | null,
  city?: string | null,
): string | null {
  if (!domain) return null;
  const d = stripAccents(domain).replace(/[^a-z0-9]/g, "");
  const c = city ? stripAccents(city).replace(/[^a-z0-9]/g, "") : "";
  return `${d}${c ? `|${c}` : ""}`;
}

/** Fingerprint nome + cidade para deduplicação. */
export function nameCityFingerprint(
  name: string,
  city?: string | null,
): string | null {
  const n = stripAccents(name).replace(/[^a-z0-9]/g, "");
  if (!n) return null;
  const c = city ? stripAccents(city).replace(/[^a-z0-9]/g, "") : "";
  return `${n}${c ? `|${c}` : ""}`;
}
