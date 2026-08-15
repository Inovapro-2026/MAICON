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

  const emojiLimit = config.max_emojis ?? (config.use_emojis === false ? 0 : undefined);
  if (emojiLimit !== undefined && emojiLimit === 0) {
    out = stripEmojis(out);
  }

  if (config.max_length !== undefined && out.length > config.max_length) {
    out = out.slice(0, Math.max(0, config.max_length)).trimEnd();
  }

  if (config.max_sentences !== undefined) {
    const parts = out.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length > config.max_sentences) {
      out = parts.slice(0, config.max_sentences).join(' ');
    }
  }

  return out.trim();
}

/** Valida a saída do LLM contra as regras da plataforma e a config do cliente. */
export function validateGeneratedReply(text: string, config: MessageConfig = {}): ValidationResult {
  const raw = String(text ?? '').trim();
  const issues: string[] = [];

  if (!raw) {
    return { valid: false, issues: ['resposta vazia'], sanitized: null };
  }

  if (countQuestions(raw) > 1) {
    issues.push('múltiplas perguntas na mesma resposta');
  }

  if (config.max_length !== undefined && raw.length > config.max_length) {
    issues.push(`comprimento acima do limite (${raw.length} > ${config.max_length})`);
  }

  if (config.max_sentences !== undefined && countSentences(raw) > config.max_sentences) {
    issues.push(`frases acima do limite (${countSentences(raw)} > ${config.max_sentences})`);
  }

  const emojiLimit = config.max_emojis ?? (config.use_emojis === false ? 0 : undefined);
  if (emojiLimit !== undefined && countEmojis(raw) > emojiLimit) {
    issues.push(`emojis acima do limite (${countEmojis(raw)} > ${emojiLimit})`);
  }

  if (issues.length === 0) {
    return { valid: true, issues: [], sanitized: null };
  }

  let sanitized = raw;
  if (countQuestions(sanitized) > 1) {
    sanitized = keepFirstQuestion(sanitized);
  }
  sanitized = sanitizeReply(sanitized, config);

  return { valid: false, issues, sanitized };
}
