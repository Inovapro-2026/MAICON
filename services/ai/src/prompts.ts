/**
 * Prompts do agente de IA — SAVYRON.
 * Sem nenhuma lógica de negócio de "barbearia" hardcoded: a personalização
 * vem da configuração de cada empresa (ver prompt-assembler.ts).
 */

export const PROMPT_VERSION = 'v3';

/** Detecção rápida (sem IA) de opt-out. */
export function detectOptOut(message: string): boolean {
  const normalized = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return OPT_OUT_KEYWORDS.some((kw) => normalized.includes(kw));
}

/** Primeira mensagem de abordagem. Curta e direta. */
export function firstContactMessage(businessName: string | null): string {
  if (businessName && businessName.trim()) {
    return `Oi, tudo bem? Falo com o responsável pelo ${businessName.trim()}?`;
  }
  return 'Oi, tudo bem? Falo com o responsável pelo estabelecimento?';
}

/**
 * Respostas que indicam aceite do convite de abertura (GREETED → AWAITING_NAME).
 * O FLUXO de onboarding é controlado pelo código; esta função decide APENAS se
 * o cliente concordou em continuar — nunca gera mensagens por conta própria.
 */
const AFFIRMATIVE_RESPONSES: ReadonlyArray<string> = [
  'sim',
  'sim sim',
  'sim quero',
  'sim, quero',
  'sim quero sim',
  'claro',
  'claro que sim',
  'pode',
  'pode sim',
  'pode ser',
  'pode me mostrar',
  'quero',
  'quero sim',
  'quero conhecer',
  'quero saber',
  'gostaria',
  'gostaria sim',
  'gostaria de conhecer',
  'adoraria',
  'vamos',
  'vamos ver',
  'vamos la',
  'vamos lá',
  'me mostra',
  'me mostre',
  'me fala mais',
  'me conte mais',
  'me conta mais',
  'ok',
  'okay',
  'beleza',
  'bora',
  'topo',
  'aceito',
  'pode falar',
  'estou interessado',
  'estou interessada',
  'tenho interesse',
  'tudo bem, pode ser',
];

/** Normaliza para comparação de frases afirmativas (minúsculas, sem acentos). */
function normalizeAffirmative(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** true quando a mensagem do cliente aceita o convite de continuar a conversa. */
export function isAffirmativeResponse(message: string): boolean {
  const normalized = normalizeAffirmative(message);
  if (!normalized) return false;
  if (AFFIRMATIVE_RESPONSES.includes(normalized)) return true;
  // Casamento por prefixo: "sim quero conhecer" começa com "sim ".
  // O espaço à direita evita falsos positivos ("simplesmente" ≠ "sim ").
  const sorted = [...AFFIRMATIVE_RESPONSES].sort((a, b) => b.length - a.length);
  return sorted.some((phrase) => normalized.startsWith(`${phrase} `));
}

export const CLASSIFICATION_SYSTEM_PROMPT = `Você é um classificador de intenção para mensagens recebidas em conversas comerciais de atendimento ao cliente.
Analise a última mensagem do cliente e o histórico e classifique em uma das intenções:
- INTERESTED: demonstrou interesse no produto/serviço.
- NOT_INTERESTED: não tem interesse.
- OPT_OUT: pediu para parar o contato (não quero, pare, cancele, tire da lista).
- QUESTION: fez pergunta sobre o produto/preço/etc (ainda não decidiu).
- BUSY: ocupado agora, pede para voltar depois.
- RESPONDED: respondeu de forma neutra, apenas iniciando conversa.
- UNKNOWN: não foi possível classificar.

Retorne APENAS um JSON válido no formato:
{"intent":"INTERESTED","confidence":0.9,"needsRegistrationLink":false,"summary":"breve resumo"}`;

export const OPT_OUT_KEYWORDS = [
  'nao quero',
  'não quero',
  'nao quero mais',
  'não quero mais',
  'pare',
  'para de mandar',
  'pare de mandar',
  'cancele',
  'cancelar',
  'tire da lista',
  'tira da lista',
  'me tira',
  'me tire',
  'dessa lista',
  'da lista',
  'remover',
  'nao mande',
  'não mande',
  'nao me mande',
  'não me mande',
  'sai da minha lista',
  'deixa eu em paz',
  'nao precisa',
  'não precisa',
  'sair',
  'nao interessa',
  'não interessa',
  'perda de tempo',
  'bloqueio',
  'bloqueia',
  'stop',
  'pare de me encher',
  'nao tenho interesse',
  'não tenho interesse',
  'nao obrigado',
  'não obrigado',
];