import { prisma } from "@prospector/database";
import {
  generateStructuredAIConfig,
  StructuredConfigInput,
} from "@prospector/ai";
import { createLogger } from "@prospector/logger";

const logger = createLogger("api.ai-config");

/**
 * Aplica os dados da empresa na IA: gera a configuração estruturada (via Groq,
 * com fallback determinístico) e persiste de forma estruturada em
 * Business + AIAgent + AISettings.behaviors.
 *
 * REGRA: nunca cria uma segunda configuração paralela — reaplicar atualiza a
 * configuração existente (upsert).
 */
export async function applyAIConfiguration(
  businessId: string,
  input: StructuredConfigInput,
) {
  const config = await generateStructuredAIConfig(input);

  // 1) Business — campos da empresa (fonte autoritativa = formulário).
  await prisma.business.update({
    where: { id: businessId },
    data: {
      name: config.company.name || input.name,
      segment: config.company.segment || input.segment,
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.description !== undefined
        ? { description: input.description || null }
        : {}),
    },
  });

  // 2) AIAgent — agente único e ativo (atualiza o existente; cria só se não houver).
  const existingAgent = await prisma.aIAgent.findFirst({
    where: { business_id: businessId, active: true },
    orderBy: { created_at: "asc" },
  });
  let agentId: string;
  if (existingAgent) {
    const updated = await prisma.aIAgent.update({
      where: { id: existingAgent.id },
      data: {
        name: config.agent.name,
        role: config.agent.role,
        objective: config.agent.objective,
        active: true,
      },
    });
    agentId = updated.id;
  } else {
    const created = await prisma.aIAgent.create({
      data: {
        business_id: businessId,
        name: config.agent.name,
        role: config.agent.role,
        objective: config.agent.objective,
        active: true,
      },
    });
    agentId = created.id;
  }

  // 3) AISettings — comportamentos estruturados + timestamp da aplicação.
  await prisma.aISettings.upsert({
    where: { business_id: businessId },
    update: {
      agent_id: agentId,
      behaviors: config.behavior,
      last_applied_at: new Date(),
    },
    create: {
      business_id: businessId,
      agent_id: agentId,
      behaviors: config.behavior,
      last_applied_at: new Date(),
    },
  });

  // 3b) BusinessSettings — CONTEXTO DA EMPRESA (fatos que a IA usa): site,
  // instagram, horários, localização, público, problemas, diferenciais,
  // posicionamento, área, objetivo e instruções. Persistir aqui garante que o
  // loader (agent-config) os entregue ao modelo como "FATOS OFICIAIS".
  await prisma.businessSettings.upsert({
    where: { business_id: businessId },
    update: {
      ...(input.website !== undefined ? { website: input.website || null } : {}),
      ...(input.instagram !== undefined
        ? { instagram: input.instagram || null }
        : {}),
      ...(input.openingHours !== undefined
        ? { opening_hours: input.openingHours || null }
        : {}),
      ...(input.location !== undefined
        ? { address: input.location || null }
        : {}),
      ...(input.targetAudience !== undefined
        ? { target_audience: input.targetAudience || null }
        : {}),
      ...(input.problemsSolved !== undefined
        ? { problems_solved: input.problemsSolved || null }
        : {}),
      ...(input.differentials !== undefined
        ? { differentials: input.differentials || null }
        : {}),
      ...(input.positioning !== undefined
        ? { positioning: input.positioning || null }
        : {}),
      ...(input.serviceArea !== undefined
        ? { service_area: input.serviceArea || null }
        : {}),
      ...(input.businessObjectives !== undefined
        ? { business_objectives: input.businessObjectives || null }
        : {}),
      ...(input.additionalInstructions !== undefined
        ? { additional_instructions: input.additionalInstructions || null }
        : {}),
    },
    create: {
      business_id: businessId,
      ...(input.website !== undefined ? { website: input.website || null } : {}),
      ...(input.instagram !== undefined
        ? { instagram: input.instagram || null }
        : {}),
      ...(input.openingHours !== undefined
        ? { opening_hours: input.openingHours || null }
        : {}),
      ...(input.location !== undefined
        ? { address: input.location || null }
        : {}),
      ...(input.targetAudience !== undefined
        ? { target_audience: input.targetAudience || null }
        : {}),
      ...(input.problemsSolved !== undefined
        ? { problems_solved: input.problemsSolved || null }
        : {}),
      ...(input.differentials !== undefined
        ? { differentials: input.differentials || null }
        : {}),
      ...(input.positioning !== undefined
        ? { positioning: input.positioning || null }
        : {}),
      ...(input.serviceArea !== undefined
        ? { service_area: input.serviceArea || null }
        : {}),
      ...(input.businessObjectives !== undefined
        ? { business_objectives: input.businessObjectives || null }
        : {}),
      ...(input.additionalInstructions !== undefined
        ? { additional_instructions: input.additionalInstructions || null }
        : {}),
    },
  });

  logger.info("Configuração estruturada aplicada na IA", {
    business_id: businessId,
    agent_id: agentId,
  });

  return { applied: true, lastAppliedAt: new Date() };
}

/** Status da configuração aplicada na IA. */
export async function getAIConfigurationStatus(businessId: string) {
  const settings = await prisma.aISettings.findUnique({
    where: { business_id: businessId },
  });
  return {
    configured: Boolean(settings?.last_applied_at),
    lastAppliedAt: settings?.last_applied_at ?? null,
  };
}
