/**
 * FILTRO DE RESPOSTA — barreira final contra vazamento de raciocínio interno,
 * chamadas de ferramenta (tool calls), JSON/artefatos técnicos e rótulos de
 * diálogo. Aplica-se a TODO texto do agente antes de exibir e de sintetizar
 * em voz.
 *
 * O modelo pode ocasionalmente produzir conteúdo contaminado. Este módulo
 * garante que o usuário receba APENAS a resposta final, direta e em pt-BR.
 */

/** Padrões de linha/prefixo que indicam raciocínio interno (chain of thought). */
export const REASONING_PATTERNS: RegExp[] = [
  /^okay,?\s*the user\b/i,
  /^the user\s+(is asking|is asking about|asked|wants|needs|is)\b/i,
  /^the s(a|á)vyron asks?\b/i,
  /^o usu[áa]rio\s+(pergunta|perguntou|quer|precisa|est[áa])\b/i,
  /^(primeiro|antes),?\s*(vou|preciso|deixa)\b/i,
  /^vou (consultar|verificar|checar|buscar|precisar)\b/i,
  /^i need to\b/i,
  /^i should\b/i,
  /^i (will|must|have to|am going to|am|could|can)\s+(check|verify|confirm|provide|look|see|use|call|invoke|retrieve|search|cross|compute|calculate|query|fetch)\b/i,
  /^let('s| me)\s+(think|step\s*by|analy|analys|confirm|check|verify|consider|look|review|cross|break|understand|see|compute|calculate|query|fetch)\b/i,
  /^(hmm|hum|huh|well)[,!.]?\b/i,
  /^wait[,!.]?\b/i,
  /^looking at\b/i,
  /^based on my\b/i,
  /^according to my (internal|reasoning|analysis|thinking)\b/i,
  /^according to (my|the) (conversation|history)\b/i,
  /^(maybe|perhaps)[, ]/i,
  /^however[, ]/i,
  /^(my thinking|my reasoning|my analysis|my internal|my thoughts?|my process)\b/i,
  /^(reasoning|analysis|thoughts?|thinking|internal context|chain of thought|cot|tool call|tool result)[:： ]/i,
  /^calling (tool|function)\b/i,
  /^(the tool|the function) (returned|result|response|said|gave)\b/i,
  /^i will (now )?(call|invoke|use|query|fetch|retrieve|search)\b/i,
  /^[a-z0-9][a-z0-9_-]*\s*[:：]\s*\{/i,
  /^\{[\s\S]*\}$/,
];

/** Artefatos técnicos removidos de qualquer lugar no texto. */
export const REASONING_ARTIFACTS: RegExp[] = [
  /<function=\w+>[^]*?<\/function>/g,
  /<\s*i?tool_call\s*>[\s\S]*?<\s*\/\s*i?tool_call\s*>/g,
  /```[\s\S]*?```/g,
  /---\s*BEGIN\s+[\s\S]*?---\s*END\s+---/gi,
];

/** Rótulos de diálogo removidos no início do texto. */
const LABEL_PREFIXES: RegExp[] = [
  /^\s*(?:assistente|jarvis|bot|ai assistant|savyron)\s*[:：]\s*/i,
];

/** Marcadores de "resposta final" — o texto após o ÚLTIMO marcador é o alvo. */
const FINAL_ANSWER_DELIMITERS: RegExp[] = [
  /\b(?:resposta\s+final|final\s*answer|final\s*response)\s*[:：]\s*/i,
];

export function containsInternalReasoning(text: string): boolean {
  return REASONING_PATTERNS.some((re) => re.test(text));
}

function stripArtifacts(text: string): string {
  let t = text;
  for (const re of REASONING_ARTIFACTS) t = t.replace(re, " ");
  // parâmetros de tool call que vazaram em linha única ("name":"x",{"...":...})
  t = t.replace(/[,\s]*(?:"(?:name|parameters|arguments|input|transcript)"\s*:\s*\{?[^,}]+)|\{[^]*?}\s*\)?/g, " ");
  return t;
}

/** true se a linha inteira é raciocínio puro (nada de resposta útil nela). */
function isReasoningLine(line: string): boolean {
  if (!line) return false;
  return REASONING_PATTERNS.some((re) => {
    if (re.test(line)) return true;
    const anchored = new RegExp(`^${re.source}$`, "i");
    return anchored.test(line);
  });
}

/** Corta o texto a partir do fim do ÚLTIMO marcador de raciocínio encontrado. */
function cutAfterLastReasoning(text: string): string {
  let lastEnd = -1;
  for (const re of REASONING_PATTERNS) {
    const it = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    let candidate = -1;
    while ((m = it.exec(text))) candidate = m.index + m[0].length;
    if (candidate > lastEnd) lastEnd = candidate;
  }
  if (lastEnd === -1) return text;
  let rest = text.slice(lastEnd).trim();
  const sentenceEnd = rest.search(/[.!?]\s+(?=["“A-ZÀ-Ú0-9])/);
  if (sentenceEnd > 0 && sentenceEnd < 240) rest = rest.slice(sentenceEnd + 1);
  return rest.trim();
}

function takeAfterFinalAnswerDelimiter(text: string): string {
  let best = text;
  for (const re of FINAL_ANSWER_DELIMITERS) {
    const it = new RegExp(re.source, "ig");
    const matches: RegExpMatchArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = it.exec(text))) matches.push(m as RegExpMatchArray);
    if (matches.length) {
      const last = matches[matches.length - 1];
      const after = text.slice(last.index! + last[0].length).trim();
      if (after && after.length > best.length * 0.4) best = after;
    }
  }
  return best;
}

/**
 * Limpa a resposta bruta do modelo para exibição/fala.
 * Nunca retorna raciocínio, tool calls, JSON ou rótulos — apenas o texto final.
 */
export function filterResponseForUser(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";

  text = stripArtifacts(text).trim();

  // remove rótulos de diálogo no início
  for (const re of LABEL_PREFIXES) text = text.replace(re, "").trim();

  // se houver "Resposta final: ...", fica apenas o conteúdo após ele
  text = takeAfterFinalAnswerDelimiter(text);

  // fluxo 1: descarta linhas que são raciocínio puro
  const kept = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isReasoningLine(l))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (kept) return kept;

  // fluxo 2: raciocínio e resposta na mesma linha → corta após o último marcador
  const cut = cutAfterLastReasoning(text);
  if (cut) {
    const reCleaned = cut
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !isReasoningLine(l))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (reCleaned) return reCleaned;
  }

  // fluxo 3: nada aproveitável restou — falha limpa (sem vazar raciocínio)
  return "";
}