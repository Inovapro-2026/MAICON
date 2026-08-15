import { config } from '@prospector/config';
import { OpenAICompatibleProvider } from './provider';

/** Provedor Groq — provedor primário. */
export class GroqProvider extends OpenAICompatibleProvider {
  readonly name = 'groq' as const;
  protected readonly baseUrl = 'https://api.groq.com/openai/v1';
  protected readonly model = config.ai.groqModel;
  protected readonly apiKey = config.ai.groqApiKey || undefined;
}
