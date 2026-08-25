/**
 * Normalização de mensagens de saída (WhatsApp).
 *
 * Regra: URL nunca vai misturada ao texto. A mensagem é separada em
 * texto explicativo + uma mensagem por URL, sem Markdown, sem duplicatas.
 */

export interface SplitUrlsResult {
  /** Texto da mensagem sem URLs (pode ser vazio). */
  text: string;
  /** URLs limpas e únicas, na ordem em que aparecem. */
  urls: string[];
}

/** Link Markdown [label](url) — captura label e url. */
const MD_LINK_PATTERN = /\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/gi;
/** URL "crua" no meio do texto. */
const BARE_URL_PATTERN = /https?:\/\/[^\s<>()[\]{}"'`]+/gi;

/** Pontuação/colchetes que podem grudar no fim de uma URL extraída. */
const TRAILING_JUNK = '.,;:!?)\\]}>"\'»';

function cleanUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  while (url.length > 0 && TRAILING_JUNK.includes(url[url.length - 1])) {
    // Parêntese só é lixo se não houver "(" correspondente na URL.
    if (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) > (url.match(/\)/g)?.length ?? 0) - 1) break;
    url = url.slice(0, -1);
  }
  return url;
}

/**
 * Extrai URLs de uma mensagem, removendo-as do texto.
 * Trata links Markdown ([texto](url)), o bug [url](url) (não duplica),
 * URLs cruas e pontuação grudada no fim.
 */
export function splitUrlsFromMessage(message: string): SplitUrlsResult {
  const original = String(message ?? '');
  let working = original;
  const urls: string[] = [];

  // 1) Links Markdown: mantém o rótulo no texto, coleta a URL.
  working = working.replace(MD_LINK_PATTERN, (_match, label: string, url: string) => {
    const cleaned = cleanUrl(url);
    if (cleaned) urls.push(cleaned);
    return label ?? '';
  });

  // 2) URLs cruas: remove do texto e coleta. A pontuação que pertencia à
  //    frase (ex.: ponto final após a URL) é devolvida ao texto.
  working = working.replace(BARE_URL_PATTERN, (match) => {
    const cleaned = cleanUrl(match);
    if (cleaned) urls.push(cleaned);
    return match.slice(cleaned.length);
  });

  // 3) Deduplica preservando a ordem.
  const uniqueUrls = [...new Set(urls)];

  if (uniqueUrls.length === 0) {
    // Sem URL: mensagem segue exatamente como veio (apenas trim das bordas).
    return { text: original.trim(), urls: [] };
  }

  // 4) Limpeza do texto restante, linha a linha: descarta linhas que ficaram
  //    só com pontuação (ex.: "." onde estava a URL), converte ":" pendurado
  //    em "." quando há mais de uma linha (frases fluidas) e junta tudo em
  //    uma única mensagem textual. Linha única segue intacta.
  const lines = working
    .replace(/^[ \t]*[.,;:!?\-–—]*[ \t]*$/gm, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/ ([.,;:!?])/g, '$1').trim())
    .filter((line) => line.length > 0);

  let text: string;
  if (lines.length === 0) {
    text = '';
  } else if (lines.length === 1) {
    text = lines[0];
  } else {
    text = lines.map((line) => (line.endsWith(':') ? `${line.slice(0, -1)}.` : line)).join(' ');
  }

  return { text, urls: uniqueUrls };
}

/** Mensagens finais a enviar: texto primeiro (se houver), depois cada URL. */
export function buildOutgoingParts(message: string): string[] {
  const { text, urls } = splitUrlsFromMessage(message);
  const parts: string[] = [];
  if (text) parts.push(text);
  parts.push(...urls);
  return parts;
}
