import { IntentClassification } from '@prospector/types';
import { createLogger } from '@prospector/logger';
import { providerManager } from './provider-manager';
import { CLASSIFICATION_SYSTEM_PROMPT, detectOptOut } from './prompts';

const logger = createLogger('ai.classifier');

/** Busca JSON dentro de uma resposta que pode conter texto adicional. */
function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function defaultClassification(intent: IntentClassification['intent']): IntentClassification {
  return { intent, confidence: 0.5, needsRegistrationLink: false, summary: '' };
}

/**
 * Classifica a intenção da última mensagem do lead.
 * Usa IA quando disponível; caso contrário, usa detecção por palavras-chave.
 */
export async function classifyIntent(params: {
  message: string;
  history: { role: 'assistant' | 'user'; content: string }[];
  timeoutMs?: number;
}): Promise<IntentClassification> {
  // 1) Detecção rápida de opt-out (sempre, mesmo sem IA)
  if (detectOptOut(params.message)) {
    logger.info('Opt-out detectado por palavras-chave');
    return { intent: 'OPT_OUT', confidence: 0.95, needsRegistrationLink: false, summary: 'Opt-out detectado por palavras-chave' };
  }

  // 2) IA
  if (providerManager.isAvailable()) {
    try {
      const messages = [
        { role: 'system' as const, content: CLASSIFICATION_SYSTEM_PROMPT },
        ...params.history.map((m) => ({ role: m.role as 'assistant' | 'user', content: m.content })),
        { role: 'user' as const, content: `Última mensagem do lead: "${params.message}"` },
      ];
      const result = await providerManager.generate(messages, {
        maxTokens: 100,
        temperature: 0,
        timeoutMs: params.timeoutMs ?? 15000,
        provider: 'nvidia',
      });
      const json = extractJson(result.text);
      if (json) {
        const parsed = JSON.parse(json) as Partial<IntentClassification>;
        if (parsed.intent) {
          const intent = parsed.intent;
          return {
            intent,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
            needsRegistrationLink: Boolean(parsed.needsRegistrationLink),
            summary: parsed.summary ?? '',
          };
        }
      }
    } catch (error) {
      logger.warn('Falha na classificação via IA; usando heurística', { error });
    }
  }

  // 3) Heurística simples
  const lower = params.message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/(interessa|quero saber mais|quero conhecer|pode me mostrar|como funciona|tenho interesse|quero testar|vamos ver|me fala mais|me passa o link|quero cadastrar)/.test(lower)) {
    return defaultClassification('INTERESTED');
  }
  if (/(ja tenho|ja uso|nao preciso|obrigado, mas|nao da|esta tudo bem|nao precisa|sem tempo|nao vou|deixa pra la|sem interesse)/.test(lower)) {
    return defaultClassification('NOT_INTERESTED');
  }
  if (/(quanto custa|preco|valor|mensalidade|plano|tabela)/.test(lower)) {
    return defaultClassification('QUESTION');
  }
  if (/(agora nao|mais tarde|depois eu falo|estou ocupado|agora ta corrido|marca pra depois)/.test(lower)) {
    return defaultClassification('BUSY');
  }
  return defaultClassification('RESPONDED');
}
