import { config } from '@prospector/config';
import { OpenAICompatibleProvider } from './provider';

/**
 * Provedor NVIDIA NIM (hosted API da NVIDIA, build.nvidia.com) —
 * compatível com OpenAI; usado como fallback gratuito após o Groq.
 */
export class NvidiaProvider extends OpenAICompatibleProvider {
  readonly name = 'nvidia' as const;
  protected readonly baseUrl = 'https://integrate.api.nvidia.com/v1';
  protected readonly model = config.ai.nvidiaModel;
  protected readonly apiKey = config.ai.nvidiaApiKey || undefined;
}