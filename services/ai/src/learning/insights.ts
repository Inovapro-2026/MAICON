/**
 * CONVERSATION LEARNING ENGINE — extração de insights (SAVYRON).
 *
 * Analisa UMA conversa (mensagens + metadados) e produz um `LearningAnalysis`
 * com os eventos comerciais brutos que alimentam a agregação de estratégias.
 * Funções PURAS e testáveis — nenhuma depende de banco, apenas dos dados da
 * conversa. Toda chamada é por tenant (`tenantId` obrigatório).
 */
import {
  CommercialStageValue,
  CommercialTechnique,
  NextAction,
  NEXT_ACTIONS,
} from "../commercial-engine";
import {
  InsightOutcomeValue,
  LearningAnalysis,
  LearningQuestionEvent,
} from "./types";

export interface LearningMessage {
  direction: "IN" | "OUT";
  content: string;
}

export interface LearningConversationMeta {
  stage: CommercialStageValue | null;
  status: "OPEN" | "CLOSED";
  leadSegment: string | null;
  leadInterest: boolean | null;
}

export interface LearningGenerationMeta {
  technique: string | null;
  nextAction: string | null;
  interest: boolean | null;
}

export interface LearningInput {
  tenantId: string;
  conversationId: string;
  leadId: string;
  messages: LearningMessage[];
  conversation?: LearningConversationMeta | null;
  generations?: LearningGenerationMeta[] | null;
}

/** Normaliza texto para extração (minúsculas, sem acentos). */
function norm(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const PAIN_RE =
  /(dificuldade|maior dificuldade|problema|dor|desafio|nao tenho clientes|poucos clientes|sem clientes|nao aparece|nao tenho retorno|falta de clientes|dificuldade em atrair|nao consigo|nao sei como|esta dificil|esta dificil|ta dificil|complicado|nao esta dando|custo alto|perco clientes|perdendo|pouca venda|poucas vendas)/i;

const OBJECTION_RE =
  /(caro|muito caro|ja tenho|crm|outro sistema|ja uso|nao preciso|vou pensar|preciso ver|sem orcamento|nao tenho orcamento|nao e pra mim|tenho um sistema|ja trabalho com outro|nao tenho tempo|depois eu vejo)/i;

const NEED_RE =
  /(mais clientes|prospectar|prospecta[cc][aã]o|automatizar|automatiza[cc][aã]o|atender|atendimento|vender mais|aumentar vendas|engajar|engajamento|campanha|leads|or[çc]amento|agendar|agendamento|divulgar|divulga[cc][aã]o|converter|convers[aã]o|whatsapp|resposta|recuperar)/i;

function extractMatches(re: RegExp, text: string, limit = 4): string[] {
  const t = String(text ?? "");
  const out: string[] = [];
  for (const m of t.matchAll(re)) {
    if (out.length >= limit) break;
    const raw = m[0].trim();
    if (raw.length < 3 || out.includes(raw)) continue;
    out.push(raw.charAt(0).toUpperCase() + raw.slice(1));
  }
  return out;
}

/** Extrai dores recorrentes do texto do cliente. */
export function extractPains(text: string): string[] {
  return extractMatches(PAIN_RE, text);
}

/** Extrai objeções frequentes do texto do cliente. */
export function extractObjections(text: string): string[] {
  return extractMatches(OBJECTION_RE, text);
}

/** Extrai necessidades reveladas do texto do cliente. */
export function extractNeeds(text: string): string[] {
  return extractMatches(NEED_RE, text);
}

const PRICE_INTENT_RE =
  /(quanto custa|qual o preco|preco|valor|mensalidade|plano|quanto e|investimento)/i;

const BUY_INTENT_RE =
  /(quero contratar|quero assinar|quero comprar|quero fechar|quero o plano|vou querer|quero testar a plataforma|quero cadastrar|manda o link|quero comecar|quero adquirir|quero ver o plano)/i;

/** Verdade se a mensagem do cliente pediu preço. */
export function isPriceRequest(text: string): boolean {
  return PRICE_INTENT_RE.test(norm(text));
}

/** Verdade se a mensagem do cliente sinalizou intenção de compra. */
export function isBuyIntent(text: string): boolean {
  return BUY_INTENT_RE.test(norm(text));
}

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(String(text ?? "").trim());
}

const SUBSTANTIVE_MIN_LENGTH = 10;

/** Analisa uma conversa e produz o insight bruto do tenant. */
export function analyzeConversation(
  input: LearningInput,
): LearningAnalysis {
  const messages = input.messages ?? [];
  const customerMessages = messages
    .filter((m) => m.direction === "IN")
    .map((m) => m.content);

  // Eventos de pergunta do agente → resposta do cliente (continuidade).
  const generations = input.generations ?? [];
  const questions: LearningQuestionEvent[] = [];
  let genIndex = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.direction !== "OUT") continue;
    const gen = generations[genIndex] ?? null;
    genIndex += 1;
    if (!isQuestion(m.content)) continue;
    const nextCustomer = messages
      .slice(i + 1)
      .find((x) => x.direction === "IN");
    const responseLength = nextCustomer ? nextCustomer.content.length : 0;
    const continuity = nextCustomer
      ? nextCustomer.content.trim().length >= SUBSTANTIVE_MIN_LENGTH
      : false;
    const rest = messages.slice(i + 1);
    const followedByClose =
      input.conversation?.status === "CLOSED" &&
      rest.filter((x) => x.direction === "IN").length <= 1;
    const interestSignal = nextCustomer
      ? isBuyIntent(nextCustomer.content)
      : false;
    questions.push({
      text: m.content.slice(0, 200),
      next_action:
        gen && gen.nextAction && NEXT_ACTIONS.includes(gen.nextAction as NextAction)
          ? (gen.nextAction as NextAction)
          : null,
      response_length: responseLength,
      continuity,
      followed_by_close: followedByClose,
      interest_signal: interestSignal,
    });
  }

  // Métricas de mensagens até eventos de preço/conversão.
  let messagesToPrice: number | null = null;
  let messagesToConversion: number | null = null;
  let customerCount = 0;
  let agentQuestionCount = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.direction === "IN") customerCount += 1;
    if (m.direction === "OUT" && isQuestion(m.content)) agentQuestionCount += 1;
    if (messagesToPrice === null && m.direction === "IN" && isPriceRequest(m.content)) {
      messagesToPrice = i + 1;
    }
    if (
      messagesToConversion === null &&
      m.direction === "IN" &&
      isBuyIntent(m.content)
    ) {
      messagesToConversion = i + 1;
    }
  }

  const pains = dedupe(customerMessages.flatMap(extractPains));
  const objections = dedupe(customerMessages.flatMap(extractObjections));
  const needs = dedupe(customerMessages.flatMap(extractNeeds));

  const lastAgentQuestion = [...messages]
    .reverse()
    .find((m) => m.direction === "OUT" && isQuestion(m.content))?.content ?? null;
  const lastCustomerMessage = [...messages]
    .reverse()
    .find((m) => m.direction === "IN")?.content ?? null;

  const techniques = dedupe(
    (input.generations ?? [])
      .map((g) => g.technique)
      .filter((t): t is string => Boolean(t)),
  ) as CommercialTechnique[];

  const stage = input.conversation?.stage ?? null;
  const outcome: InsightOutcomeValue = deriveOutcome({
    stage,
    status: input.conversation?.status ?? "OPEN",
    interest: input.conversation?.leadInterest ?? null,
  });

  return {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    leadId: input.leadId,
    segment: input.conversation?.leadSegment ?? null,
    acquisitionChannel: null,
    stageAtClose: stage,
    outcome,
    messageCount: messages.length,
    agentQuestionCount,
    customerMessageCount: customerCount,
    messagesToPrice,
    messagesToConversion,
    lastAgentQuestion,
    lastCustomerMessage,
    pains,
    objections,
    needs,
    questions,
    techniques,
    strategyUsed: null,
  };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function deriveOutcome(meta: {
  stage: CommercialStageValue | null;
  status: "OPEN" | "CLOSED";
  interest: boolean | null;
}): InsightOutcomeValue {
  if (meta.stage === "CLOSED_WON") return "CONVERTED";
  if (meta.interest === true) return "CONVERTED";
  if (meta.status === "CLOSED") {
    return meta.stage === "CLOSED_LOST" ? "LOST" : "ABANDONED";
  }
  return "ONGOING";
}

/**
 * "Assinatura" de uma decisão a partir do histórico: qual fato faltava e qual
 * ação foi tomada. Usado para agregar padrões (aprender a próxima pergunta).
 */
export function signatureFromTurn(meta: {
  knownFacts: string[];
  missing: string[];
  nextAction: NextAction;
  segment: string | null;
  acquisitionChannel: string | null;
}): { signature: string | null; action: NextAction } | null {
  const firstMissing = meta.missing.find((f) => f !== "name") ?? null;
  if (!firstMissing) return null;
  const signature = `${meta.segment ?? "*"}|${meta.acquisitionChannel ?? "*"}|${firstMissing}`;
  return { signature, action: meta.nextAction };
}

export { SUBSTANTIVE_MIN_LENGTH };