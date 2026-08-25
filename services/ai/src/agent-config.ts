/**
 * Loader unificado de configuração de IA — SAVYRON.
 *
 * ÚNICA fonte de verdade para montar o `AgentSystemPromptInput` usado tanto no
 * WhatsApp real (worker) quanto no /ai/playground. Evita duplicar a lógica de
 * carregamento de Business + BusinessSettings + AISettings + AIAgent +
 * AIKnowledge entre os dois caminhos.
 *
 * Todas as consultas são filtradas por `businessId` (multi-tenant).
 */

import { AgentSystemPromptInput } from "./prompt-assembler";
import { activeStrategiesForTenant } from "./learning/strategies";
import { RuntimeStrategy } from "./learning/types";

/**
 * Subconjunto estrutural do Prisma Client usado por este loader. Duck typing:
 * aceita o `prisma` real de `@prospector/database` sem criar acoplamento.
 */
export interface AIConfigDataSource {
  business: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{
      name: string | null;
      segment: string | null;
      description: string | null;
      slug: string | null;
      phone: string | null;
      email: string | null;
    } | null>;
  };
  businessSettings: {
    findUnique(args: {
      where: { business_id: string };
    }): Promise<{
      additional_info: string | null;
      website: string | null;
      instagram: string | null;
      opening_hours: string | null;
      address: string | null;
      timezone: string | null;
      target_audience: string | null;
      problems_solved: string | null;
      differentials: string | null;
      positioning: string | null;
      service_area: string | null;
      business_objectives: string | null;
      additional_instructions: string | null;
    } | null>;
  };
  aISettings: {
    findUnique(args: { where: { business_id: string } }): Promise<{
      tone: string;
      behaviors: unknown;
      message_config: unknown;
      custom_prompt: string | null;
      agent_id: string | null;
      agent_mode: string | null;
    } | null>;
  };
  aIAgent: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{
      id: string;
      name: string;
      role: string | null;
      description: string | null;
      objective: string | null;
    } | null>;
    findFirst(args: {
      where: { business_id: string; active: boolean };
      orderBy: { created_at: "asc" };
    }): Promise<{
      id: string;
      name: string;
      role: string | null;
      description: string | null;
      objective: string | null;
    } | null>;
  };
  aIKnowledge: {
    findMany(args: {
      where: { business_id: string; active: boolean };
      orderBy: { created_at: "asc" };
    }): Promise<{ title: string; content: string; keywords: string | null }[]>;
  };
  commercialStrategy: {
    findMany(args: unknown): Promise<unknown[]>;
  };
}

/**
 * Carrega a configuração completa de IA de uma empresa e monta o input do
 * prompt em camadas (Business > BusinessSettings > AISettings > AIAgent >
 * AIKnowledge), sempre respeitando o `businessId`.
 */
export async function loadAIConfiguration(
  db: AIConfigDataSource,
  businessId: string,
): Promise<AgentSystemPromptInput> {
  const [business, businessSettings, settings, knowledge, strategies] =
    await Promise.all([
      db.business.findUnique({ where: { id: businessId } }),
      db.businessSettings.findUnique({ where: { business_id: businessId } }),
      db.aISettings.findUnique({ where: { business_id: businessId } }),
      db.aIKnowledge.findMany({
        where: { business_id: businessId, active: true },
        orderBy: { created_at: "asc" },
      }),
      activeStrategiesForTenant(db, businessId),
    ]);

  // Sequência de abertura: REMOVIDA. A IA conduz a conversa inteira de forma
  // dinâmica, guiada pela Descrição da empresa + Base de conhecimento + memória,
  // sem roteiro fixo de perguntas nem texto de saudação hardcoded (exigência de
  // produto: nenhum script pode competir com o que está escrito na Descrição).

  const agent = settings?.agent_id
    ? await db.aIAgent.findUnique({ where: { id: settings.agent_id } })
    : await db.aIAgent.findFirst({
        where: { business_id: businessId, active: true },
        orderBy: { created_at: "asc" },
      });

  return {
    agent: agent
      ? {
          name: agent.name,
          role: agent.role,
          description: agent.description,
          objective: agent.objective,
        }
      : undefined,
    business: {
      name: business?.name,
      segment: business?.segment,
      description: business?.description,
      phone: business?.phone,
      email: business?.email,
      additionalInfo: businessSettings?.additional_info,
      website: businessSettings?.website,
      instagram: businessSettings?.instagram,
      openingHours: businessSettings?.opening_hours,
      address: businessSettings?.address,
      timezone: businessSettings?.timezone,
      targetAudience: businessSettings?.target_audience,
      problemsSolved: businessSettings?.problems_solved,
      differentials: businessSettings?.differentials,
      positioning: businessSettings?.positioning,
      serviceArea: businessSettings?.service_area,
      businessObjectives: businessSettings?.business_objectives,
      additionalInstructions: businessSettings?.additional_instructions,
    },
    settings: settings
      ? {
          tone: settings.tone,
          behaviors:
            (settings.behaviors as Record<string, boolean>) ?? undefined,
          messageConfig:
            (settings.message_config as Record<string, unknown>) ?? undefined,
          customPrompt: settings.custom_prompt,
          agentMode: settings.agent_mode ?? "sales_support",
        }
      : undefined,
    knowledge: knowledge.map((k) => ({
      title: k.title,
      content: k.content,
      keywords: k.keywords ?? undefined,
    })),
    strategies,
  };
}
