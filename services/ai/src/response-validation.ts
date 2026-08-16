/**
 * Validação/sanitização da SAÍDA do LLM — SAVYRON.
 *
 * O backend NUNCA confia que o LLM respeitou os limites configurados ou a regra
 * de "uma pergunta por mensagem". Esta validação roda em nível de código:
 *
 *   1. detecta múltiplas perguntas na mesma resposta;
 *   2. valida limites de comprimento, frases e emojis;
 *   3. retorna sanitização segura (mantém no máximo a 1ª pergunta).
 *
 * NUNCA fragmenta a resposta em várias mensagens: frases múltiplas continuam
 * sendo UMA única mensagem (ver `sanitizeReply`).
 */

export interface MessageConfig {
  max_length?: number;
  max_sentences?: number;
  max_messages_per_reply?: number;
  max_emojis?: number;
  use_emojis?: boolean;
}

/**
 * OUTPUT VALIDATOR — limites rígidos da plataforma (baseline de segurança).
 * O cliente só pode apertar esses limites, nunca relaxá-los.
 */
export const PLATFORM_POLICY = {
  max_length: 400,
  max_sentences: 4,
  max_questions: 1,
  max_emojis: 0,
} as const;

/**
 * Marcadores de vazamento de raciocínio interno no `reply`. Se o modelo
 * devolveu o plano/instruções em vez da resposta, a mensagem é REJEITADA e a
 * geração é refeita. Nunca chega ao cliente.
 */
const REASONING_LEAK_PATTERNS = [
  /we need to respond/i,
  /we need to reply/i,
  /the client said/i,
  /the customer said/i,
  /must send/i,
  /max (1|one) message/i,
  /max (1|one) question/i,
  /max emojis/i,
  /resposta antes de perguntar/i,
  /responda antes de perguntar/i,
  /stage[:=\s]/i,
  /technique[:=\s]/i,
  /action[:=\s]/i,
  /intent[:=\s]/i,
  /commercial_engine/i,
  /base de conhecimento/i,
  /regras globais/i,
  /seguranca da plataforma/i,
  /instrucoes adicionais/i,
  /gerando/gi,
  /vou gerar/i,
  /minha resposta sera/i,
  /reasoning/i,
  /analysis[:=\s]/i,
  /configura[çc][ãa]o do agente/i,
  /gerei uma resposta/i,
];

/** True se o texto parece conter raciocínio/instruções internas vazadas. */
export function hasReasoningLeak(text: string): boolean {
  return REASONING_LEAK_PATTERNS.some((re) => re.test(String(text ?? "")));
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  sanitized: string | null;
}

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;

/** Quantidade de perguntas (marcadores de interrogação) na mensagem. */
export function countQuestions(text: string): number {
  return (String(text ?? '').match(/\?/g) ?? []).length;
}

/** Quantidade de frases (separadas por . ! ?) na mensagem. */
export function countSentences(text: string): number {
  const normalized = String(text ?? '').trim();
  if (!normalized) return 0;
  const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length;
}

/** Quantidade de emojis na mensagem. */
export function countEmojis(text: string): number {
  return (String(text ?? '').match(EMOJI_RE) ?? []).length;
}

function stripEmojis(text: string): string {
  return String(text ?? '').replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
}

/** Mantém apenas até a 1ª pergunta (remove perguntas subsequentes e o que vier depois). */
export function keepFirstQuestion(text: string): string {
  const idx = String(text ?? '').indexOf('?');
  if (idx === -1) return String(text ?? '').trim();
  const cut = String(text ?? '').slice(0, idx + 1).trim();
  // Remove conectivos finais soltos que possam ligar a outra pergunta.
  return cut.replace(/\s+(e|ou|também|tambem|depois|e depois|me conta)\s*$/i, '').trim();
}

/** Aplica os limites de config (comprimento, frases, emojis) sem fragmentar a mensagem. */
export function sanitizeReply(text: string, config: MessageConfig = {}): string {
  let out = String(text ?? '').trim();

  const emojiLimit = effectiveEmojiLimit(config);
  if (emojiLimit !== undefined && emojiLimit === 0) {
    out = stripEmojis(out);
  }

  if (effectiveMaxLength(config) !== undefined && out.length > effectiveMaxLength(config)) {
    out = out.slice(0, Math.max(0, effectiveMaxLength(config))).trimEnd();
  }

  if (effectiveMaxSentences(config) !== undefined) {
    const parts = out.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length > effectiveMaxSentences(config)) {
      out = parts.slice(0, effectiveMaxSentences(config)).join(' ');
    }
  }

  return out.trim();
}

/** Limites efetivos: o mais restritivo entre a política da plataforma e a config do cliente. */
function effectiveMaxLength(config: MessageConfig): number {
  const configured = config.max_length;
  return configured !== undefined ? Math.min(configured, PLATFORM_POLICY.max_length) : PLATFORM_POLICY.max_length;
}

function effectiveMaxSentences(config: MessageConfig): number {
  const configured = config.max_sentences;
  return configured !== undefined ? Math.min(configured, PLATFORM_POLICY.max_sentences) : PLATFORM_POLICY.max_sentences;
}

function effectiveEmojiLimit(config: MessageConfig): number {
  const configured = config.max_emojis ?? (config.use_emojis === false ? 0 : undefined);
  return configured !== undefined ? Math.min(configured, PLATFORM_POLICY.max_emojis) : PLATFORM_POLICY.max_emojis;
}

/** Valida a saída do LLM contra as regras da plataforma e a config do cliente. */
export function validateGeneratedReply(text: string, config: MessageConfig = {}): ValidationResult {
  const raw = String(text ?? '').trim();
  const issues: string[] = [];

  if (!raw) {
    return { valid: false, issues: ['resposta vazia'], sanitized: null };
  }

  if (hasReasoningLeak(raw)) {
    issues.push('raciocínio interno vazado na resposta');
  }

  if (countQuestions(raw) > PLATFORM_POLICY.max_questions) {
    issues.push('múltiplas perguntas na mesma resposta');
  }

  if (raw.length > effectiveMaxLength(config)) {
    issues.push(`comprimento acima do limite (${raw.length} > ${effectiveMaxLength(config)})`);
  }

  if (countSentences(raw) > effectiveMaxSentences(config)) {
    issues.push(`frases acima do limite (${countSentences(raw)} > ${effectiveMaxSentences(config)})`);
  }

  if (countEmojis(raw) > effectiveEmojiLimit(config)) {
    issues.push(`emojis acima do limite (${countEmojis(raw)} > ${effectiveEmojiLimit(config)})`);
  }

  if (issues.length === 0) {
    return { valid: true, issues: [], sanitized: null };
  }

  // Raciocínio vazado NÃO é sanitizável — precisa ser regenerado pelo caller.
  if (issues.includes('raciocínio interno vazado na resposta')) {
    return { valid: false, issues, sanitized: null };
  }

  let sanitized = raw;
  if (countQuestions(sanitized) > PLATFORM_POLICY.max_questions) {
    sanitized = keepFirstQuestion(sanitized);
  }
  sanitized = sanitizeReply(sanitized, config);

  return { valid: false, issues, sanitized };
}
