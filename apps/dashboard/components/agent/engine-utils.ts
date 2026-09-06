/** Utilidades puras do motor conversacional do Agente (sem React, testáveis). */

// --- Configurações Calibradas de VAD (Detecção de Atividade de Voz) ---
export const VOICE_THRESHOLD = 0.007;
export const SILENCE_MS = 1400;
export const VAD_INTERVAL_MS = 100;
export const MIN_VOICED_FRAMES = 2;
export const MAX_RECORDING_MS = 20000;

// Configuração central e adaptativa de VAD (Voice Activity Detection)
export const VAD_CONFIG = {
  /** Duração mínima de fala contínua humana para disparar SPEECH_STARTED (250-400ms) */
  minSpeechDurationMs: 320,
  /** Silêncio consecutivo necessário para considerar fim da fala (hangover) */
  minSilenceDurationMs: 1200,
  /** Período inicial de calibração do ruído de fundo ambiente */
  calibrationDurationMs: 1200,
  /** Intervalo de amostragem do VAD via AnalyserNode */
  vadIntervalMs: 80,
  /** Piso mínimo absoluto do limiar de energia (evita surdez em salas ultra silenciosas) */
  minThreshold: 0.005,
  /** Teto máximo do limiar adaptativo (evita surdez sob ruído persistente moderado) */
  maxThreshold: 0.045,
  /** Margem de energia acima do piso de ruído para iniciar detecção de fala (histerese alta) */
  speechStartMargin: 0.012,
  /** Margem de energia acima do piso de ruído para sustentar fala ativa (histerese baixa) */
  speechStopMargin: 0.005,
  /** Limite inferior da frequência fundamental e formantes de fala humana (Hz) */
  voiceBandLowHz: 150,
  /** Limite superior da frequência inteligível de voz humana (Hz) */
  voiceBandHighHz: 3400,
  /** Fração mínima de energia que deve estar na faixa de voz humana para não ser ruído */
  voiceBandRatioMin: 0.35,
  /** Watchdog máximo de gravação contínua (ms) */
  maxRecordingMs: 20000,
} as const;

// Padrões de ruído sem fala real
export const NOISE_ONLY_PATTERN = /^[\s.,!?;:…'"()\-–—]+$/;

// Padrões de alucinação de Whisper em silêncio ou ruídos pontuais
const WHISPER_HALLUCINATIONS = [
  /^\s*\[(ru[íi]do|m[úu]sica|sil[êe]ncio|palmas|aplausos|tosse|risos|inaud[íi]vel|barulho|sons?|chiado|vento)\]\s*$/i,
  /^\s*\((ru[íi]do|m[úu]sica|sil[êe]ncio|palmas|aplausos|tosse|risos|inaud[íi]vel|barulho|sons?|chiado|vento)\)\s*$/i,
  /^\s*(obrigado por assistir|inscreva-se no canal|curta e compartilhe|deixe seu like|legendas? pela comunidade|subtitles by|thank you for watching)\.?\s*$/i,
];

// Grunts ou interjeições não-conversacionais isoladas
const NON_SPEECH_INTERJECTIONS = new Set([
  "uh",
  "ah",
  "hm",
  "humm",
  "hum",
  "eh",
  "um",
  "ahn",
  "ham",
  "shh",
  "psst",
]);

/**
 * Validação conservadora e defensiva da transcrição de fala do usuário.
 * Retorna true apenas se houver conteúdo semântico/linguístico válido.
 * É melhor ignorar um ruído do que o SAVYRON responder sozinho.
 */
export function isValidUserUtterance(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return false;

  // Rejeita strings puramente de pontuação ou caracteres de controle
  if (NOISE_ONLY_PATTERN.test(trimmed)) return false;

  // Rejeita padrões explícitos de ruído/música entre colchetes/parênteses ou alucinações de Whisper
  for (const pattern of WHISPER_HALLUCINATIONS) {
    if (pattern.test(trimmed)) return false;
  }

  // Remove pontuação das bordas e avalia palavras
  const clean = trimmed
    .toLowerCase()
    .replace(/[.,!?;:…'"()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return false;

  const words = clean.split(" ").filter((w) => w.length > 0);
  if (words.length === 0) return false;

  // Se tem apenas 1 palavra, não pode ser uma interjeição sem fala (ex: "uh", "hm")
  if (words.length === 1) {
    const single = words[0];
    if (NON_SPEECH_INTERJECTIONS.has(single)) return false;
    // Palavras com 1 letra (exceto "e", "é", "o", "a") são ruídos de digitação/mic
    if (single.length === 1 && !["e", "é", "o", "a"].includes(single))
      return false;
  }

  // Deve conter pelo menos um caractere alfanumérico
  return /[a-z0-9à-ú]/i.test(clean);
}

// --- Conversão numérica para TTS ---
const NUM_EXT: Record<string, string> = {
  "0": "zero",
  "1": "um",
  "2": "dois",
  "3": "três",
  "4": "quatro",
  "5": "cinco",
  "6": "seis",
  "7": "sete",
  "8": "oito",
  "9": "nove",
  "10": "dez",
  "11": "onze",
  "12": "doze",
  "13": "treze",
  "14": "catorze",
  "15": "quinze",
  "16": "dezesseis",
  "17": "dezessete",
  "18": "dezoito",
  "19": "dezenove",
  "20": "vinte",
  "30": "trinta",
  "40": "quarenta",
  "50": "cinquenta",
  "60": "sessenta",
  "70": "setenta",
  "80": "oitenta",
  "90": "noventa",
  "100": "cem",
  "200": "duzentos",
  "300": "trezentos",
  "400": "quatrocentos",
  "500": "quinhentos",
  "600": "seiscentos",
  "700": "setecentos",
  "800": "oitocentos",
  "900": "novecentos",
};
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function n2w(n: number): string {
  if (n <= 20) return NUM_EXT[String(n)] ?? String(n);
  if (n < 100) {
    const d = Math.floor(n / 10) * 10;
    const u = n % 10;
    return NUM_EXT[String(d)] + (u > 0 ? " e " + NUM_EXT[String(u)] : "");
  }
  if (n < 1000) {
    const c = Math.floor(n / 100) * 100;
    const r = n % 100;
    return (
      (c === 100 ? "cento" : NUM_EXT[String(c)]) + (r > 0 ? " e " + n2w(r) : "")
    );
  }
  if (n < 1_000_000) {
    const m = Math.floor(n / 1000);
    const r = n % 1000;
    return (m === 1 ? "mil" : n2w(m) + " mil") + (r > 0 ? " e " + n2w(r) : "");
  }
  return String(n);
}

/** Normaliza texto para síntese de voz (valores, datas, horas). */
export function normalizeForTTS(text: string): string {
  let r = text;
  r = r.replace(
    /\bR\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\b/g,
    (match, v: string) => {
      const num = parseFloat(v.replace(/\./g, "").replace(",", "."));
      if (isNaN(num)) return match;
      const reais = Math.floor(num);
      const cent = Math.round((num - reais) * 100);
      let s = "zero reais";
      if (reais > 0) s = n2w(reais) + " reais";
      if (cent > 0)
        s +=
          (reais > 0 ? " e " : "") +
          n2w(cent) +
          (cent > 1 ? " centavos" : " centavo");
      return s;
    },
  );
  r = r.replace(
    /(\d+[,.]?\d*)\s*%/g,
    (_, v: string) =>
      n2w(Math.round(parseFloat(String(v).replace(",", ".")))) + " por cento",
  );
  r = r.replace(
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
    (_, d: string, m: string, y: string) => {
      const mi = parseInt(m, 10);
      if (mi < 1 || mi > 12) return _;
      return (
        n2w(parseInt(d, 10)) +
        " de " +
        MESES[mi - 1] +
        " de " +
        n2w(parseInt(y, 10))
      );
    },
  );
  r = r.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) => {
    const hi = parseInt(h, 10);
    const mi = parseInt(m, 10);
    if (hi > 23 || mi > 59) return _;
    const hs = n2w(hi) + (hi === 1 ? " hora" : " horas");
    return mi === 0
      ? hs
      : hs + " e " + n2w(mi) + (mi === 1 ? " minuto" : " minutos");
  });
  r = r.replace(/\s+/g, " ").trim();
  return r;
}

// --- Sanitização defensiva no navegador (2ª camada anti-vazamento de raciocínio) ---
const REASONING_LINE_RE =
  /^(okay,?\s*the user\b|the user\s+(is asking|asked|wants|needs|is|is asking about)\b|i need to\b|i should\b|i (will|must|am going to|am|could|can)\s+(check|verify|confirm|provide|look|see|use|call|invoke|retrieve|search|compute|calculate)\b|let('s| me)\s+(think|confirm|check|verify|consider|look|review|break|understand|see|compute|calculate)\b|(hmm|hum|huh|well)[,!.]?\b|wait[,!.]?\b|looking at\b|based on my\b|according to my\b|^(maybe|perhaps|however)[, ]\b|(my thinking|my reasoning|my analysis)\b|(reasoning|analysis|thinking|chain of thought|cot|tool call)\s*[:：]\s*\S)/i;

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
  t = t
    .replace(
      /^\s*(resposta\s+final|final\s*answer|assistente|jarvis)\s*[:：]\s*/i,
      "",
    )
    .trim();
  return t;
}
