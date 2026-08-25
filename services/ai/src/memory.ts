/**
 * CONVERSATION MEMORY — persistência de memória de conversa.
 *
 * Guarda o estado entre turnos: resumo, objetivo, próximo passo, última
 * pergunta e fatos conhecidos do cliente (com confiança). Sem isso, o Analyzer
 * trata cada mensagem isoladamente e fragmentos como "redes sociais" ou "como"
 * são mal interpretados.
 *
 * Usado tanto no WhatsApp (key = conversation:{id}) quanto no Playground
 * (key = session:{id}), permitindo continuar o contexto entre requisições.
 */
import {
  ConversationGoal,
  CommercialStageValue,
  DecisionMemory,
  KnownFacts,
  NextAction,
} from "./commercial-engine";

/** Subconjunto estrutural do Prisma Client usado por este store (duck typing). */
export interface MemoryDataSource {
  conversationMemory: {
    findUnique(args: {
      where: { business_id_key: { business_id: string; key: string } };
    }): Promise<{
      summary: string;
      current_goal: string;
      next_action: string;
      last_question: string;
      sales_stage: string;
      known_json: unknown;
      asked_questions: unknown;
      last_customer_message: string | null;
    } | null>;
    // A assinatura genérica do Prisma é complexa; `unknown` nos args garante
    // que o client real seja atribuível a este contrato (duck typing).
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args: {
      where: { business_id: string; key: string };
    }): Promise<{ count: number }>;
  };
}

export function memoryKeyConversation(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function memoryKeySession(sessionId: string): string {
  return `session:${sessionId}`;
}

/** Carrega a memória persistida da conversa (ou null se nunca houve turno). */
export async function loadConversationMemory(
  prisma: MemoryDataSource,
  businessId: string,
  key: string,
): Promise<DecisionMemory | null> {
  const row = await prisma.conversationMemory.findUnique({
    where: { business_id_key: { business_id: businessId, key } },
  });
  if (!row) return null;
  return {
    summary: row.summary,
    current_goal: row.current_goal as ConversationGoal,
    next_action: row.next_action as NextAction,
    last_question: row.last_question,
    sales_stage: row.sales_stage as CommercialStageValue,
    known: (row.known_json as KnownFacts | null) ?? null,
    asked_questions: Array.isArray(row.asked_questions)
      ? (row.asked_questions as string[])
      : [],
    last_customer_message: row.last_customer_message ?? "",
  };
}

/** Persiste a memória atualizada da conversa (upsert). */
export async function saveConversationMemory(
  prisma: MemoryDataSource,
  businessId: string,
  key: string,
  memory: DecisionMemory,
): Promise<void> {
  await prisma.conversationMemory.upsert({
    where: { business_id_key: { business_id: businessId, key } },
    create: {
      business_id: businessId,
      key,
      summary: memory.summary ?? "",
      current_goal: memory.current_goal ?? "start_rapport",
      next_action: memory.next_action ?? "BUILD_RAPPORT",
      last_question: memory.last_question ?? "",
      sales_stage: memory.sales_stage ?? "NEW",
      known_json: memory.known ?? null,
      asked_questions: memory.asked_questions ?? [],
      last_customer_message: memory.last_customer_message ?? "",
    },
    update: {
      summary: memory.summary ?? "",
      current_goal: memory.current_goal ?? "start_rapport",
      next_action: memory.next_action ?? "BUILD_RAPPORT",
      last_question: memory.last_question ?? "",
      sales_stage: memory.sales_stage ?? "NEW",
      known_json: memory.known ?? null,
      asked_questions: memory.asked_questions ?? [],
      last_customer_message: memory.last_customer_message ?? "",
    },
  });
}

/**
 * Apaga a memória persistida de uma conversa/sessão (usado ao reiniciar o
 * playground / começar uma conversa do zero). Não lança se a chave não existir.
 */
export async function deleteConversationMemory(
  prisma: MemoryDataSource,
  businessId: string,
  key: string,
): Promise<void> {
  await prisma.conversationMemory.deleteMany({
    where: { business_id: businessId, key },
  });
}

/** Pergunta natural correspondente ao próximo passo (para context recovery). */
export function questionFromNextAction(next: NextAction): string {
  switch (next) {
    case "ASK_NAME":
      return "Qual é o seu nome?";
    case "ASK_BUSINESS_TYPE":
      return "Qual é o tipo de negócio de vocês?";
    case "ASK_CURRENT_ACQUISITION":
      return "Como vocês conseguem novos clientes hoje?";
    case "ASK_CURRENT_PROCESS":
      return "Como vocês conduzem esse processo hoje?";
    case "UNDERSTAND_PAIN":
      return "Qual é a maior dificuldade de vocês hoje?";
    default:
      return "";
  }
}

/** Monta a memória a persistir a partir do resultado de um turno. */
export function buildMemoryFromResult(result: {
  summary: string;
  goal: ConversationGoal;
  next_action: NextAction;
  known: KnownFacts;
  conversation: { stage: CommercialStageValue };
  asked_questions?: string[];
  last_customer_message?: string;
}): DecisionMemory {
  return {
    summary: result.summary,
    current_goal: result.goal,
    next_action: result.next_action,
    last_question: questionFromNextAction(result.next_action),
    sales_stage: result.conversation.stage,
    known: result.known,
    asked_questions: result.asked_questions ?? [],
    last_customer_message: result.last_customer_message ?? "",
  };
}
