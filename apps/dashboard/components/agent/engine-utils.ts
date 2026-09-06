/** Utilidades puras do motor conversacional do Agente (sem React, testáveis). */

// --- Configurações Calibradas de VAD (Detecção de Atividade de Voz) ---
export const VOICE_THRESHOLD = 0.007;
export const SILENCE_MS = 1400;
export const VAD_INTERVAL_MS = 100;
export const MIN_VOICED_FRAMES = 2;
export const MAX_RECORDING_MS = 20000;

// Padrões de ruído sem fala real
export const NOISE_ONLY_PATTERN = /^[\s.,!?;:…'"()\-–—]+$/;

// --- Conversão numérica para TTS ---
const NUM_EXT: Record<string, string> = {
  "0": "zero", "1": "um", "2": "dois", "3": "três", "4": "quatro", "5": "cinco", "6": "seis", "7": "sete", "8": "oito", "9": "nove", "10": "dez", "11": "onze", "12": "doze", "13": "treze", "14": "catorze", "15": "quinze", "16": "dezesseis", "17": "dezessete", "18": "dezoito", "19": "dezenove", "20": "vinte", "30": "trinta", "40": "quarenta", "50": "cinquenta", "60": "sessenta", "70": "setenta", "80": "oitenta", "90": "noventa", "100": "cem", "200": "duzentos", "300": "trezentos", "400": "quatrocentos", "500": "quinhentos", "600": "seiscentos", "700": "setecentos", "800": "oitocentos", "900": "novecentos",
};
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function n2w(n: number): string {
  if (n <= 20) return NUM_EXT[String(n)] ?? String(n);
  if (n < 100) { const d = Math.floor(n / 10) * 10; const u = n % 10; return NUM_EXT[String(d)] + (u > 0 ? " e " + NUM_EXT[String(u)] : ""); }
  if (n < 1000) { const c = Math.floor(n / 100) * 100; const r = n % 100; return (c === 100 ? "cento" : NUM_EXT[String(c)]) + (r > 0 ? " e " + n2w(r) : ""); }
  if (n < 1_000_000) { const m = Math.floor(n / 1000); const r = n % 1000; return (m === 1 ? "mil" : n2w(m) + " mil") + (r > 0 ? " e " + n2w(r) : ""); }
  return String(n);
}

/** Normaliza texto para síntese de voz (valores, datas, horas). */
export function normalizeForTTS(text: string): string {
  let r = text;
  r = r.replace(/\bR\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\b/g, (match, v: string) => {
    const num = parseFloat(v.replace(/\./g, "").replace(",", "."));
    if (isNaN(num)) return match;
    const reais = Math.floor(num); const cent = Math.round((num - reais) * 100);
    let s = "zero reais";
    if (reais > 0) s = n2w(reais) + " reais";
    if (cent > 0) s += (reais > 0 ? " e " : "") + n2w(cent) + (cent > 1 ? " centavos" : " centavo");
    return s;
  });
  r = r.replace(/(\d+[,.]?\d*)\s*%/g, (_, v: string) => n2w(Math.round(parseFloat(String(v).replace(",", ".")))) + " por cento");
  r = r.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, (_, d: string, m: string, y: string) => {
    const mi = parseInt(m, 10); if (mi < 1 || mi > 12) return _;
    return n2w(parseInt(d, 10)) + " de " + MESES[mi - 1] + " de " + n2w(parseInt(y, 10));
  });
  r = r.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) => {
    const hi = parseInt(h, 10); const mi = parseInt(m, 10);
    if (hi > 23 || mi > 59) return _;
    const hs = n2w(hi) + (hi === 1 ? " hora" : " horas");
    return mi === 0 ? hs : hs + " e " + n2w(mi) + (mi === 1 ? " minuto" : " minutos");
  });
  r = r.replace(/\s+/g, " ").trim();
  return r;
}

// --- Sanitização defensiva no navegador (2ª camada anti-vazamento de raciocínio) ---
const REASONING_LINE_RE = /^(okay,?\s*the user\b|the user\s+(is asking|asked|wants|needs|is|is asking about)\b|i need to\b|i should\b|i (will|must|am going to|am|could|can)\s+(check|verify|confirm|provide|look|see|use|call|invoke|retrieve|search|compute|calculate)\b|let('s| me)\s+(think|confirm|check|verify|consider|look|review|break|understand|see|compute|calculate)\b|(hmm|hum|huh|well)[,!.]?\b|wait[,!.]?\b|looking at\b|based on my\b|according to my\b|^(maybe|perhaps|however)[, ]\b|(my thinking|my reasoning|my analysis)\b|(reasoning|analysis|thinking|chain of thought|cot|tool call)\s*[:：]\s*\S)/i;

export function sanitizeAgentReply(text: string): string {
  let t = String(text ?? "").trim();
  t = t.replace(/<function=\w+>[^]*?<\/function>/g, " ");
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/\{[^]*\}/g, " ");
  t = t
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !REASONING_LINE_RE.test(l))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
  t = t.replace(/^\s*(resposta\s+final|final\s*answer|assistente|jarvis)\s*[:：]\s*/i, "").trim();
  return t;
}