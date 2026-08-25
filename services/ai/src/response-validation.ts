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
 * Emojis: o teto da plataforma é 3; o tenant habilita via use_emojis/max_emojis
 * (padrão: sem emojis — 0).
 */
export const PLATFORM_POLICY = {
  max_length: 400,
  max_sentences: 4,
  max_questions: 1,
  max_emojis: 3,
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

const EMOJI_RE =
  /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;

/** Quantidade de perguntas (marcadores de interrogação) na mensagem. */
export function countQuestions(text: string): number {
  return (String(text ?? "").match(/\?/g) ?? []).length;
}

/** Quantidade de frases (separadas por . ! ?) na mensagem. */
export function countSentences(text: string): number {
  const normalized = String(text ?? "").trim();
  if (!normalized) return 0;
  const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.length;
}

/** Quantidade de emojis na mensagem. */
export function countEmojis(text: string): number {
  return (String(text ?? "").match(EMOJI_RE) ?? []).length;
}

function stripEmojis(text: string): string {
  return String(text ?? "")
    .replace(EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove emojis além do limite permitido (0 = remove todos). */
function stripExcessEmojis(text: string, limit: number): string {
  if (!limit) return stripEmojis(text);
  let seen = 0;
  return String(text ?? "")
    .replace(EMOJI_RE, (m) => (++seen <= limit ? m : ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Mantém apenas até a 1ª pergunta (remove perguntas subsequentes e o que vier depois). */
export function keepFirstQuestion(text: string): string {
  const idx = String(text ?? "").indexOf("?");
  if (idx === -1) return String(text ?? "").trim();
  const cut = String(text ?? "")
    .slice(0, idx + 1)
    .trim();
  // Remove conectivos finais soltos que possam ligar a outra pergunta.
  return cut
    .replace(/\s+(e|ou|também|tambem|depois|e depois|me conta)\s*$/i, "")
    .trim();
}

/**
 * Corta o texto no limite de caracteres respeitando fronteira de FRASE
 * (`.`, `!`, `?`) e, como fallback, de PALAVRA — NUNCA no meio de uma palavra.
 * Evita o bug de truncamento bruto (`slice`) que deixava "...produtivid".
 */
export function truncateAtBoundary(text: string, maxLength: number): string {
  const raw = String(text ?? "").trim();
  const max = Math.max(0, Math.floor(maxLength));
  if (!raw || raw.length <= max) return raw;

  // 1) Última frase completa que ainda cabe (mantém a pontuação final).
  let cut = 0;
  for (const m of raw.matchAll(/[.!?]\s/g)) {
    const end = (m.index ?? 0) + 1;
    if (end <= max) cut = end;
    else break;
  }

  // 2) Fallback: última fronteira de palavra antes do limite.
  if (cut === 0) {
    const lastSpace = raw.slice(0, max).lastIndexOf(" ");
    if (lastSpace > 0) cut = lastSpace;
  }

  // 3) Nunca cortar DENTRO de uma URL (https://...): se o corte cair no meio
  //    de uma URL, recua para antes dela (a URL nunca é quebrada).
  if (cut > 0) {
    const before = raw.slice(0, cut);
    const urlOpen = /https?:\/\/\S*$/.exec(before);
    if (urlOpen && urlOpen[0].length > 0) {
      const beforeUrl = before.slice(0, urlOpen.index).trimEnd();
      if (beforeUrl.length > 0) cut = beforeUrl.length;
    }
  }

  // 4) NUNCA corta no meio de uma palavra: se não houver fronteira (texto sem
  //    espaço, ex.: palavra/URL única maior que o limite), mantém o texto
  //    inteiro — uma mensagem um pouco mais longa é melhor que uma palavra
  //    quebrada (bug crítico de UX "...produtivid").
  if (cut === 0) return raw;

  return raw.slice(0, cut).trim();
}

/**
 * Divide uma resposta em até `maxMessages` mensagens, cada uma com no máximo
 * `maxLength` caracteres, sempre em fronteira de frase — nunca corta palavra.
 * Com `maxMessages === 1`, trunca a resposta na fronteira (frase/palavra).
 */
export function splitReplyIntoMessages(
  text: string,
  maxLength: number,
  maxMessages: number,
): string[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const max = Math.max(1, Math.floor(maxLength));
  const count = Math.max(1, Math.floor(maxMessages));

  if (raw.length <= max || count === 1) return [truncateAtBoundary(raw, max)];

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const messages: string[] = [];
  let cur = "";
  for (const sentence of sentences) {
    const piece =
      sentence.length > max ? truncateAtBoundary(sentence, max) : sentence;
    const candidate = cur ? `${cur} ${piece}` : piece;
    if (candidate.length <= max) {
      cur = candidate;
    } else {
      if (cur) messages.push(cur);
      cur = piece;
      // Já temos count-1 mensagens cheias → `cur` vira a última permitida.
      if (messages.length >= count - 1) break;
    }
  }
  if (cur) messages.push(cur);
  return messages.slice(0, count).filter(Boolean);
}

/** Aplica os limites de config (comprimento, frases, emojis) sem fragmentar a mensagem. */
export function sanitizeReply(
  text: string,
  config: MessageConfig = {},
): string {
  let out = String(text ?? "").trim();

  const emojiLimit = effectiveEmojiLimit(config);
  out = stripExcessEmojis(out, emojiLimit);

  if (
    effectiveMaxLength(config) !== undefined &&
    out.length > effectiveMaxLength(config)
  ) {
    // NUNCA corta no meio da palavra: trunca na fronteira de frase/palavra.
    out = truncateAtBoundary(out, effectiveMaxLength(config));
  }

  if (effectiveMaxSentences(config) !== undefined) {
    const parts = out.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length > effectiveMaxSentences(config)) {
      out = parts.slice(0, effectiveMaxSentences(config)).join(" ");
    }
  }

  return out.trim();
}

/** Limites efetivos: o mais restritivo entre a política da plataforma e a config do cliente. */
function effectiveMaxLength(config: MessageConfig): number {
  const configured = config.max_length;
  return configured !== undefined
    ? Math.min(configured, PLATFORM_POLICY.max_length)
    : PLATFORM_POLICY.max_length;
}

function effectiveMaxSentences(config: MessageConfig): number {
  const configured = config.max_sentences;
  return configured !== undefined
    ? Math.min(configured, PLATFORM_POLICY.max_sentences)
    : PLATFORM_POLICY.max_sentences;
}

function effectiveMaxMessages(config: MessageConfig): number {
  const configured = config.max_messages_per_reply;
  // Rede de segurança: a plataforma permite no máximo 2 mensagens por resposta.
  return configured !== undefined
    ? Math.max(1, Math.min(Math.floor(configured), 2))
    : 1;
}

/**
 * Divide a resposta final em mensagens prontas para envio, respeitando os
 * limites configurados (máx. caracteres e máx. mensagens por resposta).
 * Nunca corta no meio de uma palavra.
 */
export function splitReplyForSending(
  reply: string,
  config: MessageConfig = {},
): string[] {
  return splitReplyIntoMessages(
    reply,
    effectiveMaxLength(config),
    effectiveMaxMessages(config),
  );
}

/**
 * Indica se a resposta NÃO cabe inteira na capacidade de entrega configurada
 * (máx. caracteres × máx. mensagens por resposta). Quando `true`, o conteúdo
 * não pode ser entregue sem perda — o caller deve RESUMIR (gerar uma versão
 * mais curta) em vez de truncar o final e perder informação.
 */
export function shouldSummarizeReply(
  reply: string,
  config: MessageConfig = {},
): boolean {
  const raw = String(reply ?? "").trim();
  if (!raw) return false;
  return (
    raw.length >
    effectiveMaxLength(config) * effectiveMaxMessages(config)
  );
}

function effectiveEmojiLimit(config: MessageConfig): number {
  // O tenant habilita emojis via use_emojis (padrão 2) ou max_emojis; o limite
  // efetivo nunca passa do teto da plataforma. Sem configuração → sem emojis.
  const configured =
    config.max_emojis ??
    (config.use_emojis === true
      ? 2
      : config.use_emojis === false
        ? 0
        : undefined);
  return configured !== undefined
    ? Math.max(0, Math.min(Math.floor(configured), PLATFORM_POLICY.max_emojis))
    : 0;
}

/** Valida a saída do LLM contra as regras da plataforma e a config do cliente. */
export function validateGeneratedReply(
  text: string,
  config: MessageConfig = {},
): ValidationResult {
  const raw = String(text ?? "").trim();
  const issues: string[] = [];

  if (!raw) {
    return { valid: false, issues: ["resposta vazia"], sanitized: null };
  }

  if (hasReasoningLeak(raw)) {
    issues.push("raciocínio interno vazado na resposta");
  }

  if (countQuestions(raw) > PLATFORM_POLICY.max_questions) {
    issues.push("múltiplas perguntas na mesma resposta");
  }

  if (raw.length > effectiveMaxLength(config)) {
    issues.push(
      `comprimento acima do limite (${raw.length} > ${effectiveMaxLength(config)})`,
    );
  }

  if (countSentences(raw) > effectiveMaxSentences(config)) {
    issues.push(
      `frases acima do limite (${countSentences(raw)} > ${effectiveMaxSentences(config)})`,
    );
  }

  if (countEmojis(raw) > effectiveEmojiLimit(config)) {
    issues.push(
      `emojis acima do limite (${countEmojis(raw)} > ${effectiveEmojiLimit(config)})`,
    );
  }

  if (issues.length === 0) {
    return { valid: true, issues: [], sanitized: null };
  }

  // Raciocínio vazado NÃO é sanitizável — precisa ser regenerado pelo caller.
  if (issues.includes("raciocínio interno vazado na resposta")) {
    return { valid: false, issues, sanitized: null };
  }

  let sanitized = raw;
  if (countQuestions(sanitized) > PLATFORM_POLICY.max_questions) {
    sanitized = keepFirstQuestion(sanitized);
  }
  sanitized = sanitizeReply(sanitized, config);

  return { valid: false, issues, sanitized };
}
