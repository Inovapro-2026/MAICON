import { AICompletionResult } from '@prospector/types';
import { createLogger } from '@prospector/logger';
import { ChatMessage, GenerateOptions, LLMProvider, ProviderName } from './types';
import { NvidiaProvider } from './providers/nvidia';
import { GroqProvider } from './providers/groq';
import { OpenRouterProvider } from './providers/openrouter';
import { OpenAIProvider } from './providers/openai';

const logger = createLogger('ai.provider-manager');

export interface ProviderManagerOptions {
  /** Força o uso de um provedor específico (ex: testes). */
  forceProvider?: ProviderName;
  timeoutMs?: number;
}

/**
 * Gerencia os provedores de IA: NVIDIA NIM (primário), Groq (fallback 1),
 * OpenRouter (fallback 2) e OpenAI (último fallback). A ordem padrão tenta
 * NVIDIA primeiro; se falhar (sem créditos, 401, 403, 429, 5xx, timeout...),
 * cai automaticamente para Groq e depois OpenRouter. Registra cada chamada.
 */
export class AIProviderManager {
  private readonly providers: LLMProvider[];
  private readonly timeoutMs: number;
  private readonly forceProvider?: ProviderName;

  constructor(options: ProviderManagerOptions = {}) {
    this.providers = [
      new NvidiaProvider(),
      new GroqProvider(),
      new OpenRouterProvider(),
      new OpenAIProvider(),
    ];
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.forceProvider = options.forceProvider;
  }

  getProviders(): LLMProvider[] {
    return this.providers;
  }

  availableProviders(): string[] {
    return this.providers.filter((p) => p.isConfigured()).map((p) => p.name);
  }

  isAvailable(): boolean {
    return this.providers.some((p) => p.isConfigured());
  }

  /** Nome do provedor primário configurado (ou null). */
  getPrimary(): string | null {
    const ordered = this.orderProviders();
    return ordered.find((p) => p.isConfigured())?.name ?? null;
  }

  /**
   * Gera uma resposta com fallback automático.
   * A ordem padrão é NVIDIA primeiro, Groq como fallback 1 e OpenRouter como
   * fallback 2. Se `options.provider` for informado, esse provedor é tentado
   * primeiro; os demais seguem como fallback. Se todos falharem, lança o erro
   * do primeiro provedor tentado.
   */
  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<AICompletionResult> {
    const ordered = this.orderProviders(options.provider);
    const attempts: Array<{ provider: string; error: string }> = [];
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    for (const provider of ordered) {
      if (!provider.isConfigured()) {
        attempts.push({ provider: provider.name, error: 'não configurado' });
        continue;
      }
      try {
        const result = await provider.generate(messages, { ...options, timeoutMs });
        logger.info('IA gerada com sucesso', {
          provider: provider.name,
          model: result.model,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          latency_ms: result.latencyMs,
        });
        return {
          text: result.text,
          provider: provider.name,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({ provider: provider.name, error: message });
        logger.warn(`Falha no provedor ${provider.name}; tentando fallback`, {
          provider: provider.name,
          error: message,
        });
      }
    }

    const primaryError = attempts[0]?.error ?? 'sem provedores configurados';
    throw new Error(`Todos os provedores de IA falharam: ${primaryError}`);
  }

  private orderProviders(preferred?: GenerateOptions['provider']): LLMProvider[] {
    if (this.forceProvider) {
      const forced = this.providers.find((p) => p.name === this.forceProvider);
      if (forced) return [forced];
    }
    if (preferred) {
      const chosen = this.providers.find((p) => p.name === preferred);
      if (chosen) {
        return [chosen, ...this.providers.filter((p) => p.name !== preferred)];
      }
    }
    return this.providers;
  }
}

export const providerManager = new AIProviderManager();
