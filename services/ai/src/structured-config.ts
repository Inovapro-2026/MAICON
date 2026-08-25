/**
 * Configuração estruturada da empresa + IA — SAVYRON.
 *
 * Converte os dados preenchidos na tela unificada (nome, segmento, e-mail,
 * telefone, descrição, site, instagram, horário, localização) em um JSON
 * estruturado `{ company, agent, behavior }` via provider de IA (Groq),
 * com fallback determinístico se o provider estiver indisponível.
 *
 * O JSON gerado NUNCA é exibido ao usuário — apenas salvo de forma
 * estruturada no banco (Business + AIAgent + AISettings.behaviors) e
 * remontado a cada conversa pelo loader de configuração.
 */
import { providerManager } from "./provider-manager";
import { createLogger } from "@prospector/logger";

const logger = createLogger("ai.structured-config");

export interface StructuredConfigInput {
  name: string;
  segment: string;
  email?: string;
  phone?: string;
  description?: string;
  website?: string;
  instagram?: string;
  openingHours?: string;
  location?: string;
  targetAudience?: string;
  problemsSolved?: string;
  differentials?: string;
  positioning?: string;
  serviceArea?: string;
  businessObjectives?: string;
  additionalInstructions?: string;
}

export interface StructuredAIConfig {
  company: {
    name: string;
    segment: string;
    email?: string;
    phone?: string;
    description?: string;
  };
  agent: {
    name: string;
    role: string;
    objective: string;
  };
  behavior: {
    natural: boolean;
    avoid_robotic_responses: boolean;
    one_question_at_a_time: boolean;
    use_conversation_context: boolean;
    do_not_repeat_information: boolean;
  };
}

/** Extrai o JSON de um texto (tolera code fences e texto ao redor). */
export function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = String(text ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    }
    throw new Error("Resposta da IA não contém JSON válido");
  }
}

/** Prompt de sistema que pede o JSON estruturado (padrão Groq JSON mode). */
export function buildStructuredConfigPrompt(
  input: StructuredConfigInput,
): string {
  const lines = [
    `Nome da empresa: ${input.name}`,
    `Segmento: ${input.segment}`,
    `E-mail: ${input.email ?? "—"}`,
    `Telefone: ${input.phone ?? "—"}`,
    `Descrição: ${input.description ?? "—"}`,
    `Site: ${input.website ?? "—"}`,
    `Instagram: ${input.instagram ?? "—"}`,
    `Horário de atendimento: ${input.openingHours ?? "—"}`,
    `Localização: ${input.location ?? "—"}`,
  ];
  return `Você é um especialista em configurar assistentes de IA de atendimento comercial.
Transforme os dados da empresa abaixo em um JSON ESTRUTURADO de configuração do agente de atendimento.

DADOS DA EMPRESA:
${lines.join("\n")}

Gere APENAS um JSON válido, SEM texto antes ou depois, com EXATAMENTE este formato:
{
  "company": { "name": string, "segment": string, "email": string, "phone": string, "description": string },
  "agent": {
    "name": string,
    "role": string,
    "objective": string
  },
  "behavior": {
    "natural": boolean,
    "avoid_robotic_responses": boolean,
    "one_question_at_a_time": boolean,
    "use_conversation_context": boolean,
    "do_not_repeat_information": boolean
  }
}

Regras:
- "company" reflete os dados informados (segmento da forma como o usuário preencheu).
- "agent.name" é um nome natural para o atendente virtual (ex.: "Atendente Virtual da ${input.name}").
- "agent.role" descreve a função do agente na empresa (ex.: "consultor de vendas e suporte ao cliente").
- "agent.objective" descreve o objetivo do agente: entender a necessidade do cliente, apresentar os produtos/serviços da ${input.name} e conduzir para conversão ou agendamento, respondendo dúvidas com base no conhecimento da empresa.
- "behavior" define comportamentos: conversa natural, evitar respostas robóticas, no máximo uma pergunta por mensagem, usar o contexto da conversa e não repetir informações já ditas.`;
}

/**
 * Normaliza a resposta da IA para a forma tipada, tolerando ausências.
 * Em caso de shape inesperado, usa valores determinísticos seguros.
 */
export function normalizeStructuredConfig(
  raw: Record<string, unknown>,
  input: StructuredConfigInput,
): StructuredAIConfig {
  const company = (raw.company ?? {}) as Record<string, unknown>;
  const agent = (raw.agent ?? {}) as Record<string, unknown>;
  const behavior = (raw.behavior ?? {}) as Record<string, unknown>;

  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;

  return {
    company: {
      name: String(company.name ?? input.name),
      segment: String(company.segment ?? input.segment),
      email: String(company.email ?? input.email ?? ""),
      phone: String(company.phone ?? input.phone ?? ""),
      description: String(company.description ?? input.description ?? ""),
    },
    agent: {
      name: String(agent.name ?? `Atendente Virtual da ${input.name}`),
      role: String(agent.role ?? "consultor de vendas e suporte ao cliente"),
      objective: String(
        agent.objective ??
          `Entender a necessidade do cliente, apresentar os produtos e serviços da ${input.name} e conduzir para conversão ou agendamento, respondendo dúvidas com base no conhecimento da empresa.`,
      ),
    },
    behavior: {
      natural: bool(behavior.natural, true),
      avoid_robotic_responses: bool(behavior.avoid_robotic_responses, true),
      one_question_at_a_time: bool(behavior.one_question_at_a_time, true),
      use_conversation_context: bool(behavior.use_conversation_context, true),
      do_not_repeat_information: bool(behavior.do_not_repeat_information, true),
    },
  };
}

/**
 * Gera a configuração estruturada via provider de IA.
 * Falha de provider → fallback determinístico (a configuração nunca fica
 * bloqueada por indisponibilidade de IA).
 */
export async function generateStructuredAIConfig(
  input: StructuredConfigInput,
): Promise<StructuredAIConfig> {
  try {
    const prompt = buildStructuredConfigPrompt(input);
    const result = await providerManager.generate(
      [
        { role: "system", content: prompt },
        {
          role: "user",
          content: "Gere o JSON estruturado de configuração do agente.",
        },
      ],
      { maxTokens: 700, jsonMode: true, timeoutMs: 25000, provider: 'openai' },
    );
    const parsed = extractJsonObject(result.text);
    const config = normalizeStructuredConfig(parsed, input);
    logger.info("Configuração estruturada gerada via IA", {
      provider: result.provider,
      model: result.model,
      agent_name: config.agent.name,
    });
    return config;
  } catch (error) {
    logger.warn(
      "Falha ao gerar configuração estruturada via IA; usando fallback determinístico",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return normalizeStructuredConfig({}, input);
  }
}
