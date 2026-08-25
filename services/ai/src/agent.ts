import { AgentContext, AICompletionResult } from '@prospector/types';
import { createLogger } from '@prospector/logger';
import { providerManager } from './provider-manager';
import { buildAgentMessages, AgentSystemPromptInput, buildAgentSystemPrompt } from './prompt-assembler';
import { firstContactMessage } from './prompts';
import { ChatMessage } from './types';

const logger = createLogger('ai.agent');

export interface AgentGenerateOptions {
  timeoutMs?: number;
  maxTokens?: number;
  /** Configuração da empresa/agente/conhecimento para montar o prompt em camadas. */
  agentConfig?: AgentSystemPromptInput;
  /** Prompt de sistema já montado (quando o chamador monta as camadas). */
  systemPrompt?: string;
}

/** Gera a resposta do agente para a conversa atual. */
export async function generateAgentReply(
  context: AgentContext,
  options: AgentGenerateOptions = {}
): Promise<AICompletionResult> {
  const messages: ChatMessage[] =
    options.systemPrompt !== undefined
      ? [
          { role: 'system', content: options.systemPrompt },
          ...context.history.map((m) => ({ role: m.role, content: m.content })),
        ]
      : buildAgentMessages(options.agentConfig ?? {}, context);

  const result = await providerManager.generate(messages, {
    maxTokens: options.maxTokens ?? 250,
    timeoutMs: options.timeoutMs,
    provider: 'openai',
  });
  logger.info('Resposta do agente gerada', {
    lead_name: context.leadName,
    provider: result.provider,
    model: result.model,
  });
  return result;
}

/** Monta o prompt de sistema a partir da configuração (para teste/playground). */
export function buildSystemPrompt(input: AgentSystemPromptInput): string {
  return buildAgentSystemPrompt(input);
}

/** Mensagem de primeira abordagem (template, sem IA). */
export function buildFirstContactMessage(businessName: string | null): string {
  return firstContactMessage(businessName);
}