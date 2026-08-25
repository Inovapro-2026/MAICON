/**
 * Validação do nome do cliente — SAVYRON.
 *
 * Quando a conversa está em `AWAITING_NAME`, a resposta do cliente NÃO pode
 * ser gravada cegamente como nome (ex.: responder "boa noite" à pergunta
 * "qual é o seu nome?" não pode virar o nome do contato).
 *
 * Fluxo:
 *   1. Heurística rápida (sem custo de IA) → REJECT / ACCEPT / UNSURE.
 *   2. Fallback leve via IA (apenas para UNSURE) → SIM/NÃO.
 *   3. Se a IA falhar, default seguro (evita gravar lixo como nome).
 */

import { providerManager } from './provider-manager';

export type NameCheck = 'ACCEPT' | 'REJECT' | 'UNSURE';

/** Saudações/expressões comuns em português que NÃO são nomes. */
const GREETINGS = new Set([
  'oi', 'oii', 'oiii', 'ola', 'olá', 'olaa', 'bom dia', 'boa tarde', 'boa noite',
  'tudo bem', 'td bem', 'tdbem', 'tudo bom', 'tudo ótimo', 'blz', 'beleza', 'bem',
  'ok', 'okay', 'sim', 'nao', 'não', 'ss', 'só isso', 'obrigado', 'obrigada',
  'muito obrigado', 'muito obrigada', 'valeu', 'vlw', 'valew', 'eai', 'e ai', 'e aí',
  'eae', 'opa', 'oi tudo bem', 'oi tudo bom', 'hello', 'hey', 'hi', 'como vai',
  'como você está', 'como voce esta', 'tranquilo', 'legal', 'show', 'pode ser',
  'pode sim', 'pode', 'sure', 'quero sim', 'gostaria', 'sim quero', 'ok obrigado',
  'bom dia tudo bem', 'boa tarde tudo bem', 'boa noite tudo bem',
]);

/** Frases que introduzem o nome e devem ser removidas antes da validação. */
const LEADING_PHRASES = [
  /^me chamo[\s,:]+/i,
  /^eu me chamo[\s,:]+/i,
  /^meu nome e[\s,:]+/i,
  /^meu nome é[\s,:]+/i,
  /^meu nome[\s,:]+/i,
  /^eu sou[\s,:]+/i,
  /^sou o[\s,:]+/i,
  /^sou a[\s,:]+/i,
  /^prazer, sou[\s,:]+/i,
  /^prazer[\s,:]+/i,
];

const MAX_NAME_CHARS = 48;
const MAX_NAME_WORDS = 4;

/** Normaliza o texto: remove frases introdutórias, pontuação de borda e espaços extras. */
export function normalizeName(raw: string): string {
  let text = String(raw ?? '').trim();
  for (const re of LEADING_PHRASES) {
    if (re.test(text)) {
      text = text.replace(re, '').trim();
      break;
    }
  }
  text = text
    .replace(/^[\s.,:;!?()\-"'`]+/g, '')
    .replace(/[\s.,:;!?()\-"'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.replace(/(?<!\p{L})\p{L}/gu, (c) => c.toLocaleUpperCase('pt-BR'));
}

/** Remove emojis do texto (para checar se restou algo além de emoji). */
function stripEmojis(text: string): string {
  return text.replace(
    /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu,
    ''
  );
}

/** Chave normalizada (minúscula, sem acentos, só letras) para busca na lista. */
function keyOf(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Greetings ordenadas da maior para a menor (para casar "boa tarde tudo bem" antes de "boa tarde"). */
const SORTED_GREETINGS: string[] = [...GREETINGS].sort((a, b) => b.length - a.length);

/**
 * Extrai o candidato a nome: remove frases introdutórias e saudações iniciais.
 * Retorna null quando o texto não contém um candidato (ex.: só saudação).
 */
function extractNameCandidate(text: string): string | null {
  let t = text.trim();
  for (const re of LEADING_PHRASES) {
    if (re.test(t)) {
      t = t.replace(re, '').trim();
      break;
    }
  }
  if (!t) return null;

  const low = keyOf(t);
  if (!low) return null;
  // Saudação/expressão inteira → não é nome.
  if (GREETINGS.has(low)) return null;

  // "boa noite, joão" → remove a saudação do início e reavalia o restante.
  for (const g of SORTED_GREETINGS) {
    if (low.startsWith(`${g} `) && low.length > g.length + 1) {
      const rest = t
        .replace(new RegExp(`^${escapeRegExp(g)}\\s*[,.:;!?]*\\s*`, 'i'), '')
        .trim();
      if (rest) {
        t = rest;
      } else {
        return null;
      }
      break;
    }
  }
  return t;
}

/**
 * Heurística rápida, sem custo de IA.
 * REJECT: claramente não é um nome. ACCEPT: padrão claro de nome próprio.
 * UNSURE: exige fallback via IA (ex.: palavra única fora da lista).
 */
export function checkNameHeuristic(raw: string): NameCheck {
  const text = String(raw ?? '').trim();
  if (!text) return 'REJECT';
  // Frase/pergunta com pontuação → não é um nome.
  if (/[?!]/.test(text)) return 'REJECT';

  const candidate = extractNameCandidate(text);
  if (!candidate) return 'REJECT';

  const cleaned = normalizeName(candidate);
  if (!cleaned) return 'REJECT';

  if (/[\d]/.test(cleaned)) return 'REJECT';
  if (cleaned.length < 2 || cleaned.length > MAX_NAME_CHARS) return 'REJECT';
  if (!/^[\p{L} .'’-]+$/u.test(cleaned)) return 'REJECT';

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_NAME_WORDS) return 'REJECT';

  // Só emoji (ou quase nada além de emoji) → não é nome.
  if (stripEmojis(cleaned).trim().length === 0) return 'REJECT';

  if (wordCount >= 2) return 'ACCEPT';

  // Palavra única fora da lista de saudações → ambíguo (ex.: "Maicon", "carro").
  return 'UNSURE';
}

/** Prompt do fallback de IA para classificar se o texto é um nome próprio. */
export const NAME_CLASSIFICATION_SYSTEM_PROMPT =
  'Você é um validador de nomes de pessoas. Responda apenas SIM ou NÃO, sem explicações.';

export function buildNameClassificationUserMessage(raw: string): string {
  return `O texto a seguir foi enviado como resposta à pergunta "qual é o seu nome?": "${String(raw ?? '').trim()}". É um nome próprio de pessoa plausível? Responda apenas SIM ou NÃO.`;
}

/** Classificador padrão via provider (Groq), barato e rápido. */
export type NameClassifier = (raw: string) => Promise<boolean>;

export const defaultClassifier: NameClassifier = async (raw: string): Promise<boolean> => {
  if (!providerManager.isAvailable()) return false;
  const result = await providerManager.generate(
    [
      { role: 'system', content: NAME_CLASSIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: buildNameClassificationUserMessage(raw) },
    ],
    { maxTokens: 5, temperature: 0, timeoutMs: 8000, provider: 'openai' }
  );
  const answer = result.text.trim().toLowerCase();
  if (/^(n[aã]o|nao)\b/.test(answer)) return false;
  if (/^sim\b/.test(answer)) return true;
  return false;
};

export interface ValidateNameOptions {
  /** Classificador injetável (testes). Padrão: providerManager. */
  classify?: NameClassifier;
}

export interface NameValidationResult {
  valid: boolean;
  name?: string;
  reason?: 'rejected' | 'ai' | 'fallback' | 'heuristic';
}

/**
 * Valida a resposta à pergunta "qual é o seu nome?".
 * Usa heurística primeiro; IA apenas para casos ambíguos.
 */
export async function validateClientName(
  raw: string,
  options: ValidateNameOptions = {}
): Promise<NameValidationResult> {
  const heuristic = checkNameHeuristic(raw);
  if (heuristic === 'REJECT') {
    return { valid: false, name: undefined, reason: 'rejected' };
  }
  if (heuristic === 'ACCEPT') {
    return { valid: true, name: normalizeName(raw), reason: 'heuristic' };
  }

  // UNSURE → fallback de IA
  const classify = options.classify ?? defaultClassifier;
  try {
    const ok = await classify(String(raw ?? '').trim());
    if (ok) {
      return { valid: true, name: normalizeName(raw), reason: 'ai' };
    }
    return { valid: false, name: undefined, reason: 'ai' };
  } catch {
    // IA indisponível: default seguro — aceita apenas se ainda parecer um nome.
    const text = normalizeName(String(raw ?? '').trim());
    const plausible =
      /^[\p{L} .'’-]+$/u.test(text) &&
      text.length >= 2 &&
      text.split(/\s+/).filter(Boolean).length <= 2;
    if (plausible) {
      return { valid: true, name: text, reason: 'fallback' };
    }
    return { valid: false, name: undefined, reason: 'fallback' };
  }
}
