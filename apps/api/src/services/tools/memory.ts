import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import type { ToolDefinition, ToolResult } from "./index";

const logger = createLogger("api.tools.memory");

/**
 * Ferramentas de MEMÓRIA — SOMENTE LEITURA.
 * A aba AGENTE pode consultar informações já salvas, mas NUNCA salvar/excluir.
 * Persistência de memória é responsabilidade da aba CONFIGURAÇÕES (/memory).
 */
export const MEMORY_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_memory",
      description: "Pesquisa informações na memória persistente da empresa (metas, preferências, decisões, instruções, objetivos). Use para recuperar contextos já registrados.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto para buscar na memória" },
          category: { type: "string", enum: ["PREFERENCE", "GOAL", "METRIC", "DECISION", "CONTEXT", "INSTRUCTION", "NOTE"], description: "Filtrar por categoria (opcional)" },
          limit: { type: "integer", description: "Quantidade máxima de resultados (padrão 5, máximo 20)", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_memories",
      description: "Lista as memórias mais recentes da empresa, útil para lembrar o contexto de conversas anteriores.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Quantidade máxima (padrão 5, máximo 20)", default: 5 },
        },
      },
    },
  },
];

export async function executeMemoryTool(
  name: string,
  businessId: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "search_memory": {
      const query = String(args.query ?? "").trim();
      const category = args.category ? String(args.category) : undefined;
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);

      if (!query) {
        return { result: { error: "Termo de busca não pode ser vazio" }, stateChanged: false };
      }

      const where: any = {
        business_id: businessId,
        user_id: userId,
        expires_at: { gte: new Date() },
        content: { contains: query, mode: "insensitive" },
      };
      if (category) where.category = category;

      const memories = await prisma.memory.findMany({
        where,
        orderBy: [{ importance: "desc" }, { created_at: "desc" }],
        take: limit,
        select: { id: true, content: true, category: true, importance: true, created_at: true },
      });

      return { result: { count: memories.length, memories }, stateChanged: false };
    }

    case "list_recent_memories": {
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
      const memories = await prisma.memory.findMany({
        where: { business_id: businessId, user_id: userId, expires_at: { gte: new Date() } },
        orderBy: { created_at: "desc" },
        take: limit,
        select: { id: true, content: true, category: true, importance: true, created_at: true },
      });
      return { result: { count: memories.length, memories }, stateChanged: false };
    }

    default:
      logger.warn("Tentativa de escrita bloqueada na camada de memória", { name, business_id: businessId });
      return {
        result: { error: "Modo somente leitura: a aba Agente não pode alterar a memória." },
        stateChanged: false,
      };
  }
}