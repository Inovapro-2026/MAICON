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

import { AgentSystemPromptInput } from './prompt-assembler';

/**
 * Subconjunto estrutural do Prisma Client usado por este loader. Duck typing:
 * aceita o `prisma` real de `@prospector/database` sem criar acoplamento.
 */
export interface AIConfigDataSource {
  business: {
    findUnique(args: { where: { id: string } }): Promise<{ name: string | null; segment: string | null; description: string | null } | null>;
  };
  businessSettings: {
    findUnique(args: { where: { business_id: string } }): Promise<{ additional_info: string | null } | null>;
  };
  aISettings: {
    findUnique(args: { where: { business_id: string } }): Promise<{
      tone: string;
      behaviors: unknown;
      message_config: unknown;
      custom_prompt: string | null;
      agent_id: string | null;
    } | null>;
  };
  aIAgent: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; name: string; role: string | null; description: string | null } | null>;
    findFirst(args: { where: { business_id: string; active: boolean }; orderBy: { created_at: 'asc' } }): Promise<{ id: string; name: string; role: string | null; description: string | null } | null>;
  };
  aIKnowledge: {
    findMany(args: { where: { business_id: string; active: boolean }; orderBy: { created_at: 'asc' } }): Promise<{ title: string; content: string }[]>;
  };
}

/**
 * Carrega a configuração completa de IA de uma empresa e monta o input do
 * prompt em camadas (Business > BusinessSettings > AISettings > AIAgent >
 * AIKnowledge), sempre respeitando o `businessId`.
 */
export async function loadAIConfiguration(db: AIConfigDataSource, businessId: string): Promise<AgentSystemPromptInput> {
  const [business, businessSettings, settings, knowledge] = await Promise.all([
    db.business.findUnique({ where: { id: businessId } }),
    db.businessSettings.findUnique({ where: { business_id: businessId } }),
    db.aISettings.findUnique({ where: { business_id: businessId } }),
    db.aIKnowledge.findMany({ where: { business_id: businessId, active: true }, orderBy: { created_at: 'asc' } }),
  ]);

  const agent = settings?.agent_id
    ? await db.aIAgent.findUnique({ where: { id: settings.agent_id } })
    : await db.aIAgent.findFirst({ where: { business_id: businessId, active: true }, orderBy: { created_at: 'asc' } });

  return {
    agent: agent ? { name: agent.name, role: agent.role, description: agent.description } : undefined,
    business: {
      name: business?.name,
      segment: business?.segment,
      description: business?.description,
      additionalInfo: businessSettings?.additional_info,
    },
    settings: settings
      ? {
          tone: settings.tone,
          behaviors: (settings.behaviors as Record<string, boolean>) ?? undefined,
          messageConfig: (settings.message_config as Record<string, unknown>) ?? undefined,
          customPrompt: settings.custom_prompt,
        }
      : undefined,
    knowledge: knowledge.map((k) => ({ title: k.title, content: k.content })),
  };
}
