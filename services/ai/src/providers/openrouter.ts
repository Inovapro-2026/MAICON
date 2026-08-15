import { config } from '@prospector/config';
import { OpenAICompatibleProvider } from './provider';

/** Provedor OpenRouter — fallback quando o Groq falha. */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  readonly name = 'openrouter' as const;
  protected readonly baseUrl = 'https://openrouter.ai/api/v1';
  protected readonly model = config.ai.openrouterModel;
  protected readonly apiKey = config.ai.openrouterApiKey || undefined;
}
